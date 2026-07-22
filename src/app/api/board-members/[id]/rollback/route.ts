import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { boardMembers, boardMemberVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireOperator(await resolveSession());
  const { id } = await params;
  const { version: targetVersion } = await req.json();

  const result = await withUserContext(session.orgId, 'all', async () => {
    const versionRow = await db.select().from(boardMemberVersions)
      .where(and(
        eq(boardMemberVersions.boardMemberId, id),
        eq(boardMemberVersions.version, targetVersion),
      ))
      .limit(1);

    if (versionRow.length === 0) throw new Error('Version not found');
    const target = versionRow[0];

    const current = await db.select().from(boardMembers)
      .where(and(eq(boardMembers.id, id), eq(boardMembers.orgId, session.orgId)))
      .limit(1);
    if (current.length === 0) throw new Error('Board member not found');

    const newVersion = (current[0].version || 1) + 1;

    await db.update(boardMembers).set({
      personaPrompt: target.personaPrompt,
      seatContext: target.seatContext,
      version: newVersion,
      updatedAt: new Date(),
    }).where(eq(boardMembers.id, id));

    await db.insert(boardMemberVersions).values({
      boardMemberId: id,
      version: newVersion,
      personaPrompt: target.personaPrompt,
      seatContext: target.seatContext,
      changedBy: session.id,
      changeNote: `Rolled back to version ${targetVersion}`,
    });

    return { version: newVersion };
  });

  return NextResponse.json(result);
}
