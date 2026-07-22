import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { objections } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireOperator(await resolveSession());
  const { id } = await params;
  const { state, note } = await req.json();

  const validStates = ['open', 'addressed', 'resolved', 'still_weak'];
  if (!state || !validStates.includes(state)) {
    return NextResponse.json({ error: 'Valid state required' }, { status: 400 });
  }

  const updated = await withUserContext(session.orgId, 'all', async () => {
    const rows = await db.select().from(objections)
      .where(and(eq(objections.id, id), eq(objections.orgId, session.orgId)))
      .limit(1);

    if (rows.length === 0) throw new Error('Not found');
    const current = rows[0];

    const history = (current.stateHistory as any[]) || [];
    history.push({
      state,
      note: note || `Manual override by operator`,
      at: new Date().toISOString(),
    });

    const result = await db.update(objections).set({
      state,
      stateHistory: history,
      updatedAt: new Date(),
    }).where(eq(objections.id, id)).returning();

    return result[0];
  });

  return NextResponse.json({ objection: updated });
}
