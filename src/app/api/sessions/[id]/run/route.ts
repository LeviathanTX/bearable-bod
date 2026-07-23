import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { reviewSessions, orgs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { runDeliberation } from '@/lib/engine/deliberate';
import { checkAiCallCap } from '@/lib/rate-limit';

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await resolveSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

    const rows = await withUserContext(session.orgId, companyScope, () =>
      db.select().from(reviewSessions)
        .where(and(eq(reviewSessions.id, id), eq(reviewSessions.orgId, session.orgId)))
        .limit(1)
    );

    if (rows.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (rows[0].status === 'complete') return NextResponse.json({ session: rows[0], already: true });

    const orgRows = await db.select({ dailyAiCallCap: orgs.dailyAiCallCap })
      .from(orgs).where(eq(orgs.id, session.orgId)).limit(1);
    const dailyCap = orgRows[0]?.dailyAiCallCap || 200;

    const capOk = await checkAiCallCap(session.orgId, dailyCap);
    if (!capOk) {
      return NextResponse.json({ error: 'Daily AI call limit reached' }, { status: 429 });
    }

    await runDeliberation(session.orgId, id, dailyCap);

    const updated = await withUserContext(session.orgId, companyScope, () =>
      db.select().from(reviewSessions).where(eq(reviewSessions.id, id)).limit(1)
    );

    return NextResponse.json({ session: updated[0] });
  } catch (err: any) {
    console.error('Deliberation run error:', err);
    return NextResponse.json({ error: err.message || 'Deliberation failed' }, { status: 500 });
  }
}
