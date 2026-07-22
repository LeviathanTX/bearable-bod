import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { AsyncLocalStorage } from 'async_hooks';
import * as schema from './schema';

const RLS_TABLES = [
  'companies', 'board_members', 'board_member_versions', 'review_sessions',
  'session_takes', 'objections', 'documents', 'document_chunks',
  'company_memory', 'outcome_logs', 'refinement_proposals', 'mcp_connectors',
];
const RLS_TABLE_PATTERN = new RegExp(`\\b(${RLS_TABLES.join('|')})\\b`);

const connectionString = process.env.DATABASE_URL!;

const pool = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: 'require',
});

const baseDb = drizzle(pool, { schema });

type TxClient = Parameters<Parameters<typeof baseDb.transaction>[0]>[0];
const txStorage = new AsyncLocalStorage<TxClient>();

export const db = new Proxy(baseDb, {
  get(target, prop, receiver) {
    const store = txStorage.getStore();
    if (store && (prop === 'select' || prop === 'insert' || prop === 'update' || prop === 'delete' || prop === 'execute')) {
      return (store as any)[prop].bind(store);
    }
    return Reflect.get(target, prop, receiver);
  },
}) as typeof baseDb;

// RLS tripwire: detect queries to org-scoped tables without withUserContext
if (process.env.NODE_ENV === 'development') {
  const origExecute = baseDb.execute.bind(baseDb);
  (baseDb as any).execute = function (...args: any[]) {
    const queryText = typeof args[0] === 'object' && args[0]?.queryChunks
      ? args[0].queryChunks.join('')
      : String(args[0] ?? '');
    if (RLS_TABLE_PATTERN.test(queryText) && !txStorage.getStore()) {
      throw new Error(`[RLS TRIPWIRE] Query to org-scoped table without withUserContext: ${queryText.slice(0, 120)}`);
    }
    return (origExecute as any)(...args);
  };
}

export async function withUserContext<T>(
  orgId: string,
  companyScope: string | 'all',
  fn: ((tx: TxClient) => Promise<T>) | (() => Promise<T>),
): Promise<T> {
  if (!orgId) {
    throw new Error('withUserContext requires a non-empty orgId');
  }

  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`);
    await tx.execute(sql`SELECT set_config('app.company_scope', ${companyScope}, true)`);
    return txStorage.run(tx, () => (fn as (tx: TxClient) => Promise<T>)(tx));
  });
}

export { sql };
