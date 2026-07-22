import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { mcpConnectors } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ConnectorManager } from '@/components/ConnectorManager';

export default async function ConnectorsPage() {
  const session = requireOperator(await resolveSession());

  const connectors = await withUserContext(session.orgId, 'all', () =>
    db.select().from(mcpConnectors).where(eq(mcpConnectors.orgId, session.orgId))
  );

  const sanitized = connectors.map((c) => ({
    ...c,
    credentialsEncrypted: c.credentialsEncrypted ? '***' : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-gray-900">MCP Connectors</h1>
          <p className="text-sm text-gray-500 mt-1">Connect external tools that board members can use during sessions.</p>
        </div>
      </div>
      <ConnectorManager initialConnectors={sanitized} />
    </div>
  );
}
