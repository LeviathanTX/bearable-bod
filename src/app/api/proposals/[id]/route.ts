import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { refinementProposals, boardMembers, boardMemberVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireOperator(await resolveSession());
  const { id } = await params;
  const { status: newStatus } = await req.json();

  if (!['approved', 'rejected'].includes(newStatus)) {
    return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 });
  }

  const result = await withUserContext(session.orgId, 'all', async () => {
    const rows = await db.select().from(refinementProposals)
      .where(and(eq(refinementProposals.id, id), eq(refinementProposals.orgId, session.orgId)))
      .limit(1);

    if (rows.length === 0) throw new Error('Not found');
    const proposal = rows[0];

    await db.update(refinementProposals).set({
      status: newStatus,
      decidedBy: session.id,
      decidedAt: new Date(),
    }).where(eq(refinementProposals.id, id));

    if (newStatus === 'approved') {
      const member = await db.select().from(boardMembers)
        .where(eq(boardMembers.id, proposal.boardMemberId))
        .limit(1);

      if (member.length > 0) {
        const current = member[0];
        const newSeatContext = current.seatContext
          ? `${current.seatContext}\n\n${proposal.proposal}`
          : proposal.proposal;
        const newVersion = (current.version || 1) + 1;

        await db.update(boardMembers).set({
          seatContext: newSeatContext,
          version: newVersion,
          updatedAt: new Date(),
        }).where(eq(boardMembers.id, proposal.boardMemberId));

        await db.insert(boardMemberVersions).values({
          boardMemberId: proposal.boardMemberId,
          version: newVersion,
          personaPrompt: current.personaPrompt,
          seatContext: newSeatContext,
          changedBy: session.id,
          changeNote: `Approved refinement proposal: ${proposal.rationale?.slice(0, 100) || 'AI suggestion'}`,
        });
      }
    }

    return { status: newStatus };
  });

  return NextResponse.json(result);
}
