import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { companies } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const rows = await withUserContext(session.orgId, companyScope, () => {
    if (session.orgRole === 'founder' && session.companyId) {
      return db.select().from(companies)
        .where(eq(companies.id, session.companyId));
    }
    return db.select().from(companies)
      .where(eq(companies.orgId, session.orgId));
  });

  return NextResponse.json({ companies: rows });
}

export async function POST(req: NextRequest) {
  const session = await resolveSession();
  if (!session || session.orgRole !== 'operator') {
    return NextResponse.json({ error: 'Operator only' }, { status: 403 });
  }

  const { name, oneLiner, targetBuyer } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const created = await withUserContext(session.orgId, 'all', () =>
    db.insert(companies).values({
      orgId: session.orgId,
      name,
      oneLiner: oneLiner || null,
      targetBuyer: targetBuyer || null,
    }).returning()
  );

  return NextResponse.json({ company: created[0] }, { status: 201 });
}
