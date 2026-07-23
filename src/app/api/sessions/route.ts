import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { reviewSessions, orgs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { checkAiCallCap } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const session = await resolveSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { companyId, seatIds, mode, focusPrompt, founderStatement } = await req.json();
    if (!companyId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return NextResponse.json({ error: 'companyId and seatIds required' }, { status: 400 });
    }

    if (seatIds.length > 6) {
      return NextResponse.json({ error: 'Maximum 6 seats per session' }, { status: 400 });
    }

    if (session.orgRole === 'founder' && session.companyId !== companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check AI call cap
    const orgRows = await db.select({ dailyAiCallCap: orgs.dailyAiCallCap })
      .from(orgs).where(eq(orgs.id, session.orgId)).limit(1);
    const dailyCap = orgRows[0]?.dailyAiCallCap || 200;

    const capOk = await checkAiCallCap(session.orgId, dailyCap);
    if (!capOk) {
      return NextResponse.json({ error: 'Daily AI call limit reached. Try again tomorrow.' }, { status: 429 });
    }

    const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

    const sessionRow = await withUserContext(session.orgId, companyScope, () =>
      db.insert(reviewSessions).values({
        orgId: session.orgId,
        companyId,
        runBy: session.id,
        mode: mode || 'full_review',
        focusPrompt: focusPrompt || null,
        founderStatement: founderStatement || null,
        seatIds,
      }).returning()
    );

    return NextResponse.json({ session: sessionRow[0] }, { status: 201 });
  } catch (err: any) {
    console.error('Session creation error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create session' }, { status: 500 });
  }
}
