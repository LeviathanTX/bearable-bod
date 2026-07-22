import { NextRequest, NextResponse } from 'next/server';
import { sendMagicLink } from '@/lib/auth/magic';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const key = `magic:${email.toLowerCase()}:${ip}`;
    const allowed = await checkRateLimit(key, 3, 300);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Try again in 5 minutes.' }, { status: 429 });
    }

    await sendMagicLink(email.toLowerCase().trim());
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('send-magic error:', err);
    const detail = {
      error: err.message || 'Internal error',
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      severity: err.severity,
    };
    return NextResponse.json(detail, { status: 500 });
  }
}
