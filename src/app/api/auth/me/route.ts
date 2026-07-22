import { NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';

export async function GET() {
  const session = await resolveSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}
