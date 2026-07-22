import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { orgs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db.select().from(orgs).where(eq(orgs.id, session.orgId)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ org: rows[0] });
}

export async function PATCH(req: NextRequest) {
  const session = requireOperator(await resolveSession());
  const body = await req.json();

  const updates: Record<string, any> = { updatedAt: new Date() };
  const allowed = ['brandName', 'logoUrl', 'accentColor', 'dailyAiCallCap'] as const;
  for (const f of allowed) {
    if (body[f] !== undefined) updates[f] = body[f];
  }

  const rows = await db.update(orgs).set(updates)
    .where(eq(orgs.id, session.orgId))
    .returning();

  return NextResponse.json({ org: rows[0] });
}
