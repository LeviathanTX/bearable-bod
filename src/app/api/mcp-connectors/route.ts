import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { mcpConnectors } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { encryptField, decryptField } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.orgRole !== 'operator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const connectors = await withUserContext(session.orgId, 'all', () =>
    db.select().from(mcpConnectors).where(eq(mcpConnectors.orgId, session.orgId))
  );

  const sanitized = connectors.map((c) => ({
    ...c,
    credentialsEncrypted: c.credentialsEncrypted ? '***' : null,
  }));

  return NextResponse.json({ connectors: sanitized });
}

export async function POST(req: NextRequest) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.orgRole !== 'operator') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, serverUrl, authType, credentials, allowedTools } = await req.json();
  if (!name || !serverUrl) {
    return NextResponse.json({ error: 'name and serverUrl required' }, { status: 400 });
  }

  let credentialsEncrypted: string | null = null;
  if (credentials) {
    credentialsEncrypted = encryptField(JSON.stringify(credentials));
  }

  const connector = await withUserContext(session.orgId, 'all', () =>
    db.insert(mcpConnectors).values({
      orgId: session.orgId,
      name,
      serverUrl,
      authType: authType || 'none',
      credentialsEncrypted,
      allowedTools: allowedTools || [],
    }).returning()
  );

  return NextResponse.json({ connector: connector[0] }, { status: 201 });
}
