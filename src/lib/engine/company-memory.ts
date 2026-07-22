import { db, sql, withUserContext } from '@/lib/db/client';
import { companyMemory } from '@/lib/db/schema';
import { embedText, vectorLiteral } from '@/lib/ai/embeddings';
import { eq, and } from 'drizzle-orm';

// Weights: 0.55 semantic, 0.25 importance, 0.20 recency
const W_SEM = 0.55;
const W_IMP = 0.25;
const W_REC = 0.20;

export async function fetchScoredMemory(
  orgId: string,
  companyId: string,
  query: string,
): Promise<string> {
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await embedText(query);
  } catch {
    // keyword fallback below
  }

  type MemoryRow = {
    id: string;
    kind: string;
    content: string;
    source: string;
    importance: number;
    updated_at: string;
    sem_sim?: number;
  };

  let rows: MemoryRow[] = [];

  await withUserContext(orgId, companyId, async () => {
    if (queryEmbedding) {
      const vec = vectorLiteral(queryEmbedding);
      const raw = await db.execute(sql`
        SELECT id, kind, content, source, importance, updated_at,
               1 - (embedding <=> ${sql.raw(`'${vec}'::vector`)}) AS sem_sim
        FROM company_memory
        WHERE company_id = ${companyId}
          AND archived = false
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${sql.raw(`'${vec}'::vector`)}
        LIMIT 40
      `);
      rows = (raw as any) as MemoryRow[];
    } else {
      const raw = await db.execute(sql`
        SELECT id, kind, content, source, importance, updated_at
        FROM company_memory
        WHERE company_id = ${companyId}
          AND archived = false
        ORDER BY updated_at DESC
        LIMIT 25
      `);
      rows = (raw as any) as MemoryRow[];
    }
  });

  const now = Date.now();
  const scored = rows.map((e) => {
    const semScore = e.sem_sim ?? 0;
    const impScore = e.importance ?? 0.5;
    const updatedAt = e.updated_at ? new Date(e.updated_at).getTime() : 0;
    const ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
    const recScore = Math.exp(-ageDays / 30);
    const score = W_SEM * semScore + W_IMP * impScore + W_REC * recScore;
    return { ...e, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 25);

  if (top.length === 0) return '';

  const lines = top.map((e) => `- [${e.kind}] ${e.content.slice(0, 300)}`);
  return lines.join('\n');
}

export async function storeMemory(
  orgId: string,
  companyId: string,
  kind: 'fact' | 'decision' | 'progress_note',
  content: string,
  source: 'session' | 'operator' | 'founder' | 'outcome',
  importance: number = 0.5,
): Promise<void> {
  let embedding: number[] | null = null;
  try {
    embedding = await embedText(content);
  } catch {
    // store without embedding
  }

  await withUserContext(orgId, companyId, async () => {
    await db.insert(companyMemory).values({
      orgId,
      companyId,
      kind,
      content,
      source,
      importance,
      embedding,
    });
  });
}
