import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { orgs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendFounderInvite } from '@/lib/auth/magic';

export async function POST(req: NextRequest) {
  const session = requireOperator(await resolveSession());
  const { email, companyId } = await req.json();

  if (!email || !companyId) {
    return NextResponse.json({ error: 'email and companyId required' }, { status: 400 });
  }

  const orgRows = await db.select().from(orgs).where(eq(orgs.id, session.orgId)).limit(1);
  const orgName = orgRows[0]?.brandName || orgRows[0]?.name || 'PreBoard';

  await sendFounderInvite(email, session.orgId, companyId, orgName);
  return NextResponse.json({ ok: true }, { status: 201 });
}
