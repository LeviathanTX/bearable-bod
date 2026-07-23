import { NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { documentChunks, documents } from '@/lib/db/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { embedText } from '@/lib/ai/embeddings';
import { sql } from 'drizzle-orm';

export const maxDuration = 60;

export async function POST() {
  const session = requireOperator(await resolveSession());

  const chunks = await withUserContext(session.orgId, 'all', () =>
    db.select({ id: documentChunks.id, content: documentChunks.content, documentId: documentChunks.documentId })
      .from(documentChunks)
      .innerJoin(documents, eq(documents.id, documentChunks.documentId))
      .where(and(
        isNull(documentChunks.embedding),
        eq(documents.orgId, session.orgId),
      ))
      .limit(50)
  );

  let success = 0;
  let failed = 0;

  for (const chunk of chunks) {
    try {
      const embedding = await embedText(chunk.content);
      await db.execute(sql`
        UPDATE document_chunks
        SET embedding = ${sql.raw(`'[${embedding.join(',')}]'::vector`)}
        WHERE id = ${chunk.id}
      `);
      success++;
    } catch (err) {
      console.error(`[backfill] Failed chunk ${chunk.id}: ${(err as Error).message}`);
      failed++;
    }
  }

  // Update document status for any docs that now have all embeddings
  if (success > 0) {
    await db.execute(sql`
      UPDATE documents SET status = 'ready', updated_at = NOW()
      WHERE id IN (
        SELECT d.id FROM documents d
        WHERE d.org_id = ${session.orgId}
          AND d.status IN ('partial_embeddings', 'no_embeddings', 'processing')
          AND NOT EXISTS (
            SELECT 1 FROM document_chunks dc
            WHERE dc.document_id = d.id AND dc.embedding IS NULL
          )
      )
    `);
  }

  return NextResponse.json({
    processed: chunks.length,
    success,
    failed,
    remaining: chunks.length === 50 ? 'more chunks pending, call again' : 0,
  });
}
