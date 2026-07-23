import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { reviewSessions, sessionTakes, sessionVotes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const STALL_THRESHOLD_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const rows = await withUserContext(session.orgId, companyScope, () =>
    db.select().from(reviewSessions)
      .where(and(eq(reviewSessions.id, id), eq(reviewSessions.orgId, session.orgId)))
      .limit(1)
  );

  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const reviewSession = rows[0];

  // Mark as stalled if active and untouched for >30 min
  if (reviewSession.status === 'active') {
    const lastUpdate = (reviewSession.updatedAt || reviewSession.createdAt || new Date()).getTime();
    if (Date.now() - lastUpdate > STALL_THRESHOLD_MS) {
      await withUserContext(session.orgId, companyScope, () =>
        db.update(reviewSessions)
          .set({ status: 'stalled', updatedAt: new Date() })
          .where(eq(reviewSessions.id, id))
      );
      reviewSession.status = 'stalled';
    }
  }

  const [takes, votes] = await Promise.all([
    withUserContext(session.orgId, companyScope, () =>
      db.select().from(sessionTakes).where(eq(sessionTakes.sessionId, id))
    ),
    withUserContext(session.orgId, companyScope, () =>
      db.select().from(sessionVotes).where(eq(sessionVotes.sessionId, id))
    ),
  ]);

  return NextResponse.json({ session: reviewSession, takes, votes });
}
