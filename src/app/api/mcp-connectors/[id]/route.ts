import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { mcpConnectors } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.orgRole !== 'operator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  await withUserContext(session.orgId, 'all', () =>
    db.delete(mcpConnectors).where(and(eq(mcpConnectors.id, id), eq(mcpConnectors.orgId, session.orgId)))
  );

  return NextResponse.json({ deleted: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.orgRole !== 'operator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const updates = await req.json();

  const allowed: Record<string, any> = {};
  if (updates.name) allowed.name = updates.name;
  if (updates.serverUrl) allowed.serverUrl = updates.serverUrl;
  if (updates.status) allowed.status = updates.status;
  if (updates.allowedTools) allowed.allowedTools = updates.allowedTools;
  allowed.updatedAt = new Date();

  const result = await withUserContext(session.orgId, 'all', () =>
    db.update(mcpConnectors).set(allowed)
      .where(and(eq(mcpConnectors.id, id), eq(mcpConnectors.orgId, session.orgId)))
      .returning()
  );

  return NextResponse.json({ connector: result[0] });
}
