import { NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { AVAILABLE_MODELS } from '@/lib/ai/models';

export async function GET() {
  const session = await resolveSession();
  requireOperator(session);
  return NextResponse.json({ models: AVAILABLE_MODELS });
}
