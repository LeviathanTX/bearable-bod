import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { reviewSessions, sessionTakes, orgs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { runSingleSeatInterrogation, runSingleSeatAdvise, runSynthesisPhase } from '@/lib/engine/deliberate';
import { checkAiCallCap } from '@/lib/rate-limit';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await resolveSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const requestedPhase = body.phase || 'interrogate';

    const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

    const rows = await withUserContext(session.orgId, companyScope, () =>
      db.select().from(reviewSessions)
        .where(and(eq(reviewSessions.id, id), eq(reviewSessions.orgId, session.orgId)))
        .limit(1)
    );

    if (rows.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (rows[0].status === 'complete') return NextResponse.json({ session: rows[0], phase: 'complete' });

    const orgRows = await db.select({ dailyAiCallCap: orgs.dailyAiCallCap })
      .from(orgs).where(eq(orgs.id, session.orgId)).limit(1);
    const dailyCap = orgRows[0]?.dailyAiCallCap || 200;

    const capOk = await checkAiCallCap(session.orgId, dailyCap);
    if (!capOk) {
      return NextResponse.json({ error: 'Daily AI call limit reached' }, { status: 429 });
    }

    const seatIds = (rows[0].seatIds as string[]) || [];

    if (requestedPhase === 'interrogate') {
      const completedTakes = await withUserContext(session.orgId, 'all', () =>
        db.select({ boardMemberId: sessionTakes.boardMemberId })
          .from(sessionTakes)
          .where(and(eq(sessionTakes.sessionId, id), eq(sessionTakes.phase, 'interrogate')))
      );
      const completedIds = new Set(completedTakes.map((t) => t.boardMemberId));
      const nextSeatId = seatIds.find((sid) => !completedIds.has(sid));

      if (!nextSeatId) {
        return NextResponse.json({ phase: 'interrogate_done', next: 'advise', progress: { done: seatIds.length, total: seatIds.length } });
      }

      await runSingleSeatInterrogation(session.orgId, id, nextSeatId, dailyCap);
      const done = completedIds.size + 1;
      const allDone = done >= seatIds.length;

      return NextResponse.json({
        phase: allDone ? 'interrogate_done' : 'interrogate',
        next: allDone ? 'advise' : 'interrogate',
        progress: { done, total: seatIds.length, lastSeatId: nextSeatId },
      });
    }

    if (requestedPhase === 'advise') {
      const completedTakes = await withUserContext(session.orgId, 'all', () =>
        db.select({ boardMemberId: sessionTakes.boardMemberId })
          .from(sessionTakes)
          .where(and(eq(sessionTakes.sessionId, id), eq(sessionTakes.phase, 'advise')))
      );
      const completedIds = new Set(completedTakes.map((t) => t.boardMemberId));
      const nextSeatId = seatIds.find((sid) => !completedIds.has(sid));

      if (!nextSeatId) {
        return NextResponse.json({ phase: 'advise_done', next: 'synthesize', progress: { done: seatIds.length, total: seatIds.length } });
      }

      await runSingleSeatAdvise(session.orgId, id, nextSeatId, dailyCap);
      const done = completedIds.size + 1;
      const allDone = done >= seatIds.length;

      return NextResponse.json({
        phase: allDone ? 'advise_done' : 'advise',
        next: allDone ? 'synthesize' : 'advise',
        progress: { done, total: seatIds.length, lastSeatId: nextSeatId },
      });
    }

    if (requestedPhase === 'synthesize') {
      await runSynthesisPhase(session.orgId, id, dailyCap);
      const updated = await withUserContext(session.orgId, companyScope, () =>
        db.select().from(reviewSessions).where(eq(reviewSessions.id, id)).limit(1)
      );
      return NextResponse.json({ session: updated[0], phase: 'complete' });
    }

    return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
  } catch (err: any) {
    console.error('Deliberation run error:', err);
    return NextResponse.json({ error: err.message || 'Deliberation failed' }, { status: 500 });
  }
}
