import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { refinementProposals, boardMembers, boardMemberVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  const session = requireOperator(await resolveSession());

  const rows = await withUserContext(session.orgId, 'all', () =>
    db.select().from(refinementProposals)
      .where(eq(refinementProposals.orgId, session.orgId))
  );

  return NextResponse.json({ proposals: rows });
}
