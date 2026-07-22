import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { outcomeLogs } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { storeMemory } from '@/lib/engine/company-memory';

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await withUserContext(session.orgId, 'all', () =>
    db.select().from(outcomeLogs)
      .where(eq(outcomeLogs.orgId, session.orgId))
      .orderBy(desc(outcomeLogs.createdAt))
      .limit(50)
  );

  return NextResponse.json({ outcomes: rows });
}

export async function POST(req: NextRequest) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { companyId, outcome, whatActuallyCameUp, notes } = await req.json();
  if (!companyId || !outcome) {
    return NextResponse.json({ error: 'companyId and outcome required' }, { status: 400 });
  }

  const validOutcomes = ['pitched', 'won', 'lost', 'stalled'];
  if (!validOutcomes.includes(outcome)) {
    return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 });
  }

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const created = await withUserContext(session.orgId, companyScope, () =>
    db.insert(outcomeLogs).values({
      orgId: session.orgId,
      companyId,
      loggedBy: session.id,
      outcome,
      whatActuallyCameUp: whatActuallyCameUp || null,
      notes: notes || null,
    }).returning()
  );

  // Store as company memory
  const memContent = `Outcome: ${outcome}. ${whatActuallyCameUp || ''} ${notes || ''}`.trim();
  await storeMemory(session.orgId, companyId, 'fact', memContent, 'outcome', 0.8);

  return NextResponse.json({ outcome: created[0] }, { status: 201 });
}
