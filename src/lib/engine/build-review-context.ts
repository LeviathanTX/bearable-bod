import { db, sql, withUserContext } from '@/lib/db/client';
import { companies, objections, reviewSessions, companyMemory, documentChunks, documents, outcomeLogs } from '@/lib/db/schema';
import { eq, and, ne, desc } from 'drizzle-orm';
import { fetchScoredMemory } from './company-memory';
import { embedText, vectorLiteral } from '@/lib/ai/embeddings';

export interface ReviewContext {
  company: {
    name: string;
    oneLiner: string | null;
    targetBuyer: string | null;
    stage: string;
    readinessNote: string | null;
    orgContext: any | null;
  };
  openObjections: string;
  priorSyntheses: string;
  companyMemoryContext: string;
  relevantChunks: string;
  previousPunchList: string;
  outcomes: string;
}

export async function buildReviewContext(
  orgId: string,
  companyId: string,
  query: string,
): Promise<ReviewContext> {
  const [
    companyRow,
    openObjectionsRows,
    priorSessionRows,
    memoryCtx,
    chunks,
    outcomeRows,
  ] = await Promise.all([
    withUserContext(orgId, companyId, () =>
      db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
    ).catch(() => []),

    withUserContext(orgId, companyId, () =>
      db.select().from(objections)
        .where(and(eq(objections.companyId, companyId), ne(objections.state, 'resolved')))
        .orderBy(desc(objections.createdAt))
    ).catch(() => []),

    withUserContext(orgId, companyId, () =>
      db.select({ synthesis: reviewSessions.synthesis, punchList: reviewSessions.punchList, createdAt: reviewSessions.createdAt })
        .from(reviewSessions)
        .where(and(eq(reviewSessions.companyId, companyId), eq(reviewSessions.status, 'complete')))
        .orderBy(desc(reviewSessions.createdAt))
        .limit(3)
    ).catch(() => []),

    fetchScoredMemory(orgId, companyId, query).catch(() => ''),

    findRelevantChunks(orgId, companyId, query).catch(() => ''),

    withUserContext(orgId, companyId, () =>
      db.select().from(outcomeLogs)
        .where(eq(outcomeLogs.companyId, companyId))
        .orderBy(desc(outcomeLogs.createdAt))
        .limit(5)
    ).catch(() => []),
  ]);

  const company = companyRow[0] || { name: 'Unknown', oneLiner: null, targetBuyer: null, stage: 'intake', readinessNote: null };

  const objectionLines = openObjectionsRows.map((o) =>
    `[${o.severity}] ${o.title} (${o.lens || 'general'}, state: ${o.state}) - ${o.detail?.slice(0, 200) || ''}`
  ).join('\n');

  const syntheses = priorSessionRows
    .filter((s) => s.synthesis)
    .map((s) => s.synthesis!.slice(0, 500))
    .join('\n---\n');

  const prevPunchList = priorSessionRows[0]?.punchList
    ? JSON.stringify(priorSessionRows[0].punchList)
    : '';

  const outcomeLines = outcomeRows.map((o) =>
    `[${o.outcome}] ${o.whatActuallyCameUp || ''} ${o.notes || ''}`
  ).join('\n');

  return {
    company: {
      name: company.name,
      oneLiner: company.oneLiner,
      targetBuyer: company.targetBuyer,
      stage: company.stage,
      readinessNote: company.readinessNote,
      orgContext: (company as any).orgContext || null,
    },
    openObjections: objectionLines || 'None on record.',
    priorSyntheses: syntheses || 'No prior sessions.',
    companyMemoryContext: memoryCtx || 'No memory entries.',
    relevantChunks: chunks || 'No relevant documents.',
    previousPunchList: prevPunchList || 'None.',
    outcomes: outcomeLines || 'No outcomes recorded.',
  };
}

async function findRelevantChunks(orgId: string, companyId: string, query: string): Promise<string> {
  let chunkZeroRows: { content: string }[] = [];
  let topKRows: { content: string; score?: number }[] = [];

  await withUserContext(orgId, companyId, async () => {
    const raw = await db.execute(sql`
      SELECT dc.content
      FROM document_chunks dc
      INNER JOIN documents d ON d.id = dc.document_id
      WHERE d.company_id = ${companyId}
        AND d.status IN ('ready', 'partial_embeddings')
        AND dc.chunk_index = 0
      ORDER BY d.created_at DESC
      LIMIT 1
    `);
    chunkZeroRows = (raw as any) as { content: string }[];
  });

  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await embedText(query);
  } catch (e) {
    console.warn(`[top-k] Query embed failed, falling back to recency: ${(e as Error).message}`);
  }

  await withUserContext(orgId, companyId, async () => {
    if (queryEmbedding) {
      const vec = vectorLiteral(queryEmbedding);
      const raw = await db.execute(sql`
        SELECT dc.content, (dc.embedding <=> ${sql.raw(`'${vec}'::vector`)}) as distance
        FROM document_chunks dc
        INNER JOIN documents d ON d.id = dc.document_id
        WHERE d.company_id = ${companyId}
          AND d.status IN ('ready', 'partial_embeddings')
          AND dc.embedding IS NOT NULL
          AND dc.chunk_index != 0
        ORDER BY dc.embedding <=> ${sql.raw(`'${vec}'::vector`)}
        LIMIT 8
      `);
      topKRows = (raw as any) as { content: string; distance?: number }[];
      if (topKRows.length > 0) {
        console.log(`[top-k] Cosine retrieval: ${topKRows.length} chunks, distances: ${topKRows.map((r: any) => (r.distance as number)?.toFixed(3)).join(', ')}`);
      } else {
        console.warn(`[top-k] No embedded chunks found for company ${companyId}, falling back to recency`);
        const fallback = await db.execute(sql`
          SELECT dc.content
          FROM document_chunks dc
          INNER JOIN documents d ON d.id = dc.document_id
          WHERE d.company_id = ${companyId}
            AND d.status IN ('ready', 'partial_embeddings')
            AND dc.chunk_index != 0
          ORDER BY d.created_at DESC, dc.chunk_index ASC
          LIMIT 8
        `);
        topKRows = (fallback as any) as { content: string }[];
      }
    } else {
      const raw = await db.execute(sql`
        SELECT dc.content
        FROM document_chunks dc
        INNER JOIN documents d ON d.id = dc.document_id
        WHERE d.company_id = ${companyId}
          AND d.status IN ('ready', 'partial_embeddings')
          AND dc.chunk_index != 0
        ORDER BY d.created_at DESC, dc.chunk_index ASC
        LIMIT 8
      `);
      topKRows = (raw as any) as { content: string }[];
    }
  });

  const allRows = [...chunkZeroRows, ...topKRows];
  if (allRows.length === 0) return '';
  return allRows.map((r) => r.content.slice(0, 800)).join('\n---\n');
}
