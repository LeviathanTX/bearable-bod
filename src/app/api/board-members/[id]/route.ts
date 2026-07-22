import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { boardMembers, boardMemberVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireOperator(await resolveSession());
  const { id } = await params;
  const body = await req.json();

  const updated = await withUserContext(session.orgId, 'all', async () => {
    const existing = await db.select().from(boardMembers)
      .where(and(eq(boardMembers.id, id), eq(boardMembers.orgId, session.orgId)))
      .limit(1);
    if (existing.length === 0) throw new Error('Not found');

    const current = existing[0];
    const newVersion = (current.version || 1) + 1;

    const updates: Record<string, any> = { updatedAt: new Date(), version: newVersion };
    const fields = ['name', 'title', 'committeeRole', 'expertise', 'personaPrompt', 'seatContext', 'interrogationStyle', 'avatarEmoji', 'avatarUrl', 'model', 'active'] as const;
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }

    const rows = await db.update(boardMembers).set(updates).where(eq(boardMembers.id, id)).returning();

    if (body.personaPrompt !== undefined || body.seatContext !== undefined) {
      await db.insert(boardMemberVersions).values({
        boardMemberId: id,
        version: newVersion,
        personaPrompt: body.personaPrompt ?? current.personaPrompt,
        seatContext: body.seatContext ?? current.seatContext,
        changedBy: session.id,
        changeNote: body.changeNote || 'Updated',
      });
    }

    return rows[0];
  });

  return NextResponse.json({ boardMember: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireOperator(await resolveSession());
  const { id } = await params;

  await withUserContext(session.orgId, 'all', () =>
    db.update(boardMembers).set({ active: false, updatedAt: new Date() })
      .where(and(eq(boardMembers.id, id), eq(boardMembers.orgId, session.orgId)))
  );

  return NextResponse.json({ ok: true });
}
