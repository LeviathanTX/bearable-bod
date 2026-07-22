import { NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { NEURAL_VOICES } from '@/app/api/tts/route';

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ voices: NEURAL_VOICES });
}
