import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Paystack: initialize a card payment.
 * Amount must be in pesewas (1 GHS = 100 pesewas).
 * Returns authorization_url for redirect.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                { status: 429, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': rateLimitResult.resetIn.toString() } }
            );
        }

        const body = await req.json();
        const { orderId, customerEmail } = body;

        if (!orderId || typeof orderId !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderId' }, { status: 400 });
        }

        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!secretKey) {
            console.error('Missing PAYSTACK_SECRET_KEY');
            return NextResponse.json({ success: false, message: 'Payment gateway configuration error' }, { status: 500 });
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        const query = supabaseAdmin
            .from('orders')
            .select('id, order_number, total, email, payment_status');

        if (isUUID) {
            query.or(`id.eq.${orderId},order_number.eq.${orderId}`);
        } else {
            query.eq('order_number', orderId);
        }

        const { data: order, error: orderError } = await query.single();

        if (orderError || !order) {
            console.error('[Paystack] Order not found:', orderId);
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (order.payment_status === 'paid') {
            return NextResponse.json({ success: false, message: 'Order is already paid' }, { status: 400 });
        }

        const amount = Number(order.total);
        if (!amount || amount <= 0) {
            return NextResponse.json({ success: false, message: 'Invalid order amount' }, { status: 400 });
        }

        const orderRef = order.order_number || orderId;
        const requestUrl = new URL(req.url);
        const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

        // Unique reference for this transaction (Paystack requirement)
        const reference = `paystack-${orderRef}-${Date.now()}`;
        const amountInPesewas = Math.round(amount * 100);

        const payload = {
            email: customerEmail || order.email,
            amount: amountInPesewas,
            currency: 'GHS',
            reference,
            callback_url: `${baseUrl}/api/payment/paystack/callback?reference=${reference}&order_ref=${encodeURIComponent(orderRef)}`,
            metadata: {
                order_number: orderRef,
                order_id: order.id,
                customer_email: customerEmail || order.email
            }
        };

        const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${secretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.status && result.data?.authorization_url) {
            return NextResponse.json({
                success: true,
                url: result.data.authorization_url,
                reference: result.data.reference
            });
        }

        return NextResponse.json({
            success: false,
            message: result.message || 'Failed to initialize Paystack payment'
        }, { status: 400 });

    } catch (error: any) {
        console.error('[Paystack] Error:', error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}
