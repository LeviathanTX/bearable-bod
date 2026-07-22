import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { boardMemberVersions } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireOperator(await resolveSession());
  const { id } = await params;

  const versions = await withUserContext(session.orgId, 'all', () =>
    db.select().from(boardMemberVersions)
      .where(eq(boardMemberVersions.boardMemberId, id))
      .orderBy(desc(boardMemberVersions.version))
  );

  return NextResponse.json({ versions });
}
