import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { uploadToS3, buildS3Key } from '@/lib/s3';
import { processDocument } from '@/lib/engine/document-processor';
import { embedText } from '@/lib/ai/embeddings';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: companyId } = await params;

  if (session.orgRole === 'founder' && session.companyId !== companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const label = formData.get('label') as string | null;

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const s3Key = buildS3Key(session.orgId, companyId, file.name);

  await uploadToS3(s3Key, buffer, file.type);

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const docRow = await withUserContext(session.orgId, companyScope, () =>
    db.insert(documents).values({
      orgId: session.orgId,
      companyId,
      uploadedBy: session.id,
      filename: file.name,
      fileType: file.type,
      s3Key,
      status: 'processing',
      label: label || null,
    }).returning()
  );

  try {
    const processed = await processDocument(buffer, file.type);
    let embedFailures = 0;

    await withUserContext(session.orgId, companyScope, async () => {
      for (let i = 0; i < processed.chunks.length; i++) {
        let embedding: number[] | null = null;
        try {
          embedding = await embedText(processed.chunks[i]);
        } catch (embedErr) {
          embedFailures++;
          console.error(`[embed-fail] doc=${docRow[0].id} chunk=${i} error=${(embedErr as Error).message}`);
        }

        await db.insert(documentChunks).values({
          documentId: docRow[0].id,
          chunkIndex: i,
          content: processed.chunks[i],
          embedding,
          tokenCount: Math.ceil(processed.chunks[i].length / 4),
        });
      }

      const status = embedFailures === 0 ? 'ready'
        : embedFailures < processed.chunks.length ? 'partial_embeddings'
        : 'no_embeddings';

      await db.update(documents).set({
        contentText: processed.text.slice(0, 100000),
        status,
        updatedAt: new Date(),
      }).where(eq(documents.id, docRow[0].id));
    });

    if (embedFailures > 0) {
      console.warn(`[doc-upload] ${embedFailures}/${processed.chunks.length} chunks failed embedding for doc ${docRow[0].id}`);
    }
  } catch (err) {
    console.error(`[doc-upload] Processing failed for doc ${docRow[0].id}:`, err);
    await withUserContext(session.orgId, companyScope, () =>
      db.update(documents).set({ status: 'failed', updatedAt: new Date() })
        .where(eq(documents.id, docRow[0].id))
    );
  }

  return NextResponse.json({ document: docRow[0] }, { status: 201 });
}
