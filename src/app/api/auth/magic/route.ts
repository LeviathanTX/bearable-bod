import { NextRequest, NextResponse } from 'next/server';
import { redeemMagicToken } from '@/lib/auth/magic';
import { setSessionCookie } from '@/lib/auth/session';

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return 'https://main.d242wvalc8srk3.amplifyapp.com';
}

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl();
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(`${baseUrl}/auth?error=missing_token`);
  }

  const result = await redeemMagicToken(token);
  if (!result) {
    return NextResponse.redirect(`${baseUrl}/auth?error=invalid_or_expired`);
  }

  await setSessionCookie(result.sessionToken);
  return NextResponse.redirect(`${baseUrl}/dashboard`);
}
