import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { reviewSessions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateGovernanceSimulation, generateBusinessCase, generateFounderDeck } from '@/lib/engine/deliverables';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await resolveSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const type = body.type as string;

    if (!['governance_simulation', 'business_case', 'founder_deck'].includes(type)) {
      return NextResponse.json({ error: 'type must be governance_simulation, business_case, or founder_deck' }, { status: 400 });
    }

    const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

    const rows = await withUserContext(session.orgId, companyScope, () =>
      db.select().from(reviewSessions)
        .where(and(eq(reviewSessions.id, id), eq(reviewSessions.orgId, session.orgId)))
        .limit(1)
    );

    if (rows.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (rows[0].status !== 'complete') return NextResponse.json({ error: 'Session must be complete' }, { status: 400 });

    let result;
    switch (type) {
      case 'governance_simulation':
        result = await generateGovernanceSimulation(session.orgId, id);
        break;
      case 'business_case':
        result = await generateBusinessCase(session.orgId, id);
        break;
      case 'founder_deck':
        result = await generateFounderDeck(session.orgId, id);
        break;
    }

    return NextResponse.json({ deliverable: result });
  } catch (err: any) {
    console.error('Deliverable generation error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
