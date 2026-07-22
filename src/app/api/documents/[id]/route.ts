import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSignedDownloadUrl } from '@/lib/s3';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const rows = await withUserContext(session.orgId, companyScope, () =>
    db.select().from(documents)
      .where(and(eq(documents.id, id), eq(documents.orgId, session.orgId)))
      .limit(1)
  );

  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const doc = rows[0];
  const downloadUrl = await getSignedDownloadUrl(doc.s3Key);

  return NextResponse.json({ document: doc, downloadUrl });
}
