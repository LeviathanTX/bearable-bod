import { NextRequest, NextResponse } from 'next/server';
import { redeemMagicToken } from '@/lib/auth/magic';
import { setSessionCookie } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/auth?error=missing_token', req.url));
  }

  const result = await redeemMagicToken(token);
  if (!result) {
    return NextResponse.redirect(new URL('/auth?error=invalid_or_expired', req.url));
  }

  await setSessionCookie(result.sessionToken);
  return NextResponse.redirect(new URL('/dashboard', req.url));
}
