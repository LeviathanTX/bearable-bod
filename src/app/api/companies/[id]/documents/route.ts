import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { uploadToS3, buildS3Key } from '@/lib/s3';
import { processDocument } from '@/lib/engine/document-processor';
import { embedText } from '@/lib/ai/embeddings';

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

  // Process async (in-request for now; could move to background)
  try {
    const processed = await processDocument(buffer, file.type);

    await withUserContext(session.orgId, companyScope, async () => {
      await db.update(documents).set({
        contentText: processed.text.slice(0, 100000),
        status: 'ready',
        updatedAt: new Date(),
      }).where(eq(documents.id, docRow[0].id));

      for (let i = 0; i < processed.chunks.length; i++) {
        let embedding: number[] | null = null;
        try {
          embedding = await embedText(processed.chunks[i]);
        } catch { /* store without embedding */ }

        await db.insert(documentChunks).values({
          documentId: docRow[0].id,
          chunkIndex: i,
          content: processed.chunks[i],
          embedding,
          tokenCount: Math.ceil(processed.chunks[i].length / 4),
        });
      }
    });
  } catch (err) {
    await withUserContext(session.orgId, companyScope, () =>
      db.update(documents).set({ status: 'failed', updatedAt: new Date() })
        .where(eq(documents.id, docRow[0].id))
    );
  }

  return NextResponse.json({ document: docRow[0] }, { status: 201 });
}
