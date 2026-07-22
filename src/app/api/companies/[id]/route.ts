import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { companies } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  if (session.orgRole === 'founder' && session.companyId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const rows = await withUserContext(session.orgId, companyScope, () =>
    db.select().from(companies)
      .where(and(eq(companies.id, id), eq(companies.orgId, session.orgId)))
      .limit(1)
  );

  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ company: rows[0] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveSession();
  if (!session || session.orgRole !== 'operator') {
    return NextResponse.json({ error: 'Operator only' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, any> = { updatedAt: new Date() };
  const allowed = ['name', 'oneLiner', 'targetBuyer', 'stage', 'readinessNote', 'archived'] as const;
  for (const f of allowed) {
    if (body[f] !== undefined) updates[f] = body[f];
  }

  const rows = await withUserContext(session.orgId, 'all', () =>
    db.update(companies).set(updates)
      .where(and(eq(companies.id, id), eq(companies.orgId, session.orgId)))
      .returning()
  );

  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ company: rows[0] });
}
