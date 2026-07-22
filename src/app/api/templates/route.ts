import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { boardMemberTemplates } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = await db.select().from(boardMemberTemplates);
  return NextResponse.json({ templates });
}
