import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'logo.png');
    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
