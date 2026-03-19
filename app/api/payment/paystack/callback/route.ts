import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';

/**
 * Paystack redirects the customer here after payment (GET).
 * Query: reference (Paystack ref; we use format paystack-ORDER_NUMBER-timestamp so we can derive order_ref).
 * Optional: order_ref (our order number) in case we have it in URL.
 * We verify the transaction with Paystack, mark order paid, then redirect to order-success.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get('reference');
    let orderRef = searchParams.get('order_ref');
    // Paystack may only pass reference; we encode order in it: paystack-ORD-123-4567890
    if (!orderRef && reference?.startsWith('paystack-')) {
        const parts = reference.split('-');
        if (parts.length >= 3) {
            orderRef = parts.slice(1, -1).join('-');
        }
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || 'https://mariesbeautytools.vercel.app').replace(/\/+$/, '');
    const successRedirect = `${baseUrl}/order-success?order=${encodeURIComponent(orderRef || '')}&payment_success=true`;
    const failRedirect = `${baseUrl}/order-success?order=${encodeURIComponent(orderRef || '')}&payment_success=false`;

    if (!reference || !orderRef) {
        console.error('[Paystack Callback] Missing reference or order_ref');
        return NextResponse.redirect(failRedirect);
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
        console.error('[Paystack Callback] PAYSTACK_SECRET_KEY not set');
        return NextResponse.redirect(failRedirect);
    }

    try {
        const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: { 'Authorization': `Bearer ${secretKey}` }
        });
        const result = await verifyRes.json();

        if (!result.status || !result.data || result.data.status !== 'success') {
            console.error('[Paystack Callback] Verify failed:', result.message || result);
            await supabaseAdmin
                .from('orders')
                .update({ payment_status: 'failed' })
                .eq('order_number', orderRef);
            return NextResponse.redirect(failRedirect);
        }

        const data = result.data;
        const amountPaid = (data.amount || 0) / 100;

        const { data: existingOrder, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, payment_status, total, email')
            .eq('order_number', orderRef)
            .single();

        if (fetchError || !existingOrder) {
            console.error('[Paystack Callback] Order not found:', orderRef);
            return NextResponse.redirect(failRedirect);
        }

        if (existingOrder.payment_status === 'paid') {
            return NextResponse.redirect(successRedirect);
        }

        const expectedAmount = Number(existingOrder.total);
        if (Math.abs(amountPaid - expectedAmount) > 0.01) {
            console.error('[Paystack Callback] Amount mismatch. Expected:', expectedAmount, 'Got:', amountPaid);
            return NextResponse.redirect(failRedirect);
        }

        const { data: orderJson, error: updateError } = await supabaseAdmin
            .rpc('mark_order_paid', {
                order_ref: orderRef,
                moolre_ref: `paystack-${reference}`
            });

        if (updateError) {
            console.error('[Paystack Callback] mark_order_paid error:', updateError.message);
            return NextResponse.redirect(failRedirect);
        }

        try {
            if (orderJson?.email) {
                await supabaseAdmin.rpc('update_customer_stats', {
                    p_customer_email: orderJson.email,
                    p_order_total: orderJson.total
                });
            }
        } catch (_) { /* optional */ }

        try {
            await sendOrderConfirmation(orderJson);
        } catch (e: any) {
            console.error('[Paystack Callback] Notification error:', e.message);
        }

        return NextResponse.redirect(successRedirect);
    } catch (error: any) {
        console.error('[Paystack Callback] Error:', error);
        return NextResponse.redirect(failRedirect);
    }
}
