import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { checkAiCallCap } from '@/lib/rate-limit';
import { db } from '@/lib/db/client';
import { orgs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getAwsClientConfig } from '@/lib/aws-config';

const polly = new PollyClient(getAwsClientConfig());

export const NEURAL_VOICES = [
  { id: 'Matthew', label: 'Matthew', gender: 'Male', accent: 'US' },
  { id: 'Joanna', label: 'Joanna', gender: 'Female', accent: 'US' },
  { id: 'Stephen', label: 'Stephen', gender: 'Male', accent: 'US' },
  { id: 'Ruth', label: 'Ruth', gender: 'Female', accent: 'US' },
  { id: 'Gregory', label: 'Gregory', gender: 'Male', accent: 'US' },
  { id: 'Danielle', label: 'Danielle', gender: 'Female', accent: 'US' },
  { id: 'Arthur', label: 'Arthur', gender: 'Male', accent: 'UK' },
  { id: 'Amy', label: 'Amy', gender: 'Female', accent: 'UK' },
] as const;

export async function POST(req: NextRequest) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgRows = await db.select({ dailyAiCallCap: orgs.dailyAiCallCap })
    .from(orgs).where(eq(orgs.id, session.orgId)).limit(1);
  const dailyCap = orgRows[0]?.dailyAiCallCap || 200;

  const capOk = await checkAiCallCap(session.orgId, dailyCap);
  if (!capOk) {
    return NextResponse.json({ error: 'Daily AI call limit reached' }, { status: 429 });
  }

  const { text, voiceId } = await req.json();
  if (!text || !voiceId) {
    return NextResponse.json({ error: 'text and voiceId required' }, { status: 400 });
  }

  if (text.length > 3000) {
    return NextResponse.json({ error: 'Text too long (max 3000 chars)' }, { status: 400 });
  }

  const validVoice = NEURAL_VOICES.find((v) => v.id === voiceId);
  if (!validVoice) {
    return NextResponse.json({ error: 'Invalid voiceId' }, { status: 400 });
  }

  const command = new SynthesizeSpeechCommand({
    Text: text,
    VoiceId: voiceId,
    OutputFormat: 'mp3',
    Engine: 'neural',
  });

  const result = await polly.send(command);
  if (!result.AudioStream) {
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 });
  }

  const audioBytes = await result.AudioStream.transformToByteArray();

  return new NextResponse(Buffer.from(audioBytes), {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
