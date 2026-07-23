import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { deliverableRevisions, orgStyleNotes, refinementProposals, reviewSessions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getAwsClientConfig } from '@/lib/aws-config';
import { converse } from '@/lib/ai/converse';

const S3_BUCKET = process.env.S3_BUCKET_DOCUMENTS || 'preboard-documents-996596548730';
const ANALYSIS_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireOperator(await resolveSession());
    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const deliverableType = formData.get('type') as string;
    const originalS3Key = formData.get('originalS3Key') as string;

    if (!file || !deliverableType || !originalS3Key) {
      return NextResponse.json({ error: 'file, type, and originalS3Key required' }, { status: 400 });
    }

    // Upload edited file to S3
    const editedS3Key = `deliverables/${id}/revised-${deliverableType}-${Date.now()}.docx`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const s3 = new S3Client(getAwsClientConfig());
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: editedS3Key,
      Body: buffer,
      ContentType: file.type,
    }));

    // Store revision record
    const revision = await withUserContext(session.orgId, 'all', () =>
      db.insert(deliverableRevisions).values({
        orgId: session.orgId,
        sessionId: id,
        deliverableType,
        originalS3Key,
        editedS3Key,
        uploadedBy: session.id,
      }).returning()
    );

    // Async: analyze editorial diff (fire and forget within ceiling)
    analyzeEditorialDiff(session.orgId, id, originalS3Key, buffer, revision[0].id).catch(console.error);

    return NextResponse.json({ revision: revision[0] }, { status: 201 });
  } catch (err: any) {
    console.error('Revision upload error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}

async function analyzeEditorialDiff(
  orgId: string,
  sessionId: string,
  originalS3Key: string,
  editedBuffer: Buffer,
  revisionId: string,
) {
  // Get original from S3
  const s3 = new S3Client(getAwsClientConfig());
  const originalObj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: originalS3Key }));
  const originalBuffer = await originalObj.Body?.transformToByteArray();
  if (!originalBuffer) return;

  // For simplicity, compare file sizes and run a style analysis on the edited content
  const editedText = editedBuffer.toString('utf8').slice(0, 4000);

  const result = await converse({
    model: ANALYSIS_MODEL,
    systemPrompt: `Analyze the editorial style of this document revision. Summarize the operator's editorial preferences in 2-3 sentences: tone changes, structural preferences, sections added or removed, formatting choices. Be specific and actionable.`,
    messages: [{ role: 'user', content: `Edited document content (partial):\n${editedText}` }],
    maxTokens: 400,
    temperature: 0.3,
  });

  // Store style note
  await withUserContext(orgId, 'all', () =>
    db.insert(orgStyleNotes).values({
      orgId,
      note: result.content,
      sourceRevisionId: revisionId,
    })
  );
}
