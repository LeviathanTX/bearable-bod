import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { deliverableRevisions } from '@/lib/db/schema';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getAwsClientConfig } from '@/lib/aws-config';
import { DOCUMENTS_BUCKET } from '@/lib/s3';

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

    const editedS3Key = `deliverables/${id}/revised-${deliverableType}-${Date.now()}.docx`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const s3 = new S3Client(getAwsClientConfig());
    await s3.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: editedS3Key,
      Body: buffer,
      ContentType: file.type,
    }));

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

    return NextResponse.json({ revision: revision[0] }, { status: 201 });
  } catch (err: any) {
    console.error('Revision upload error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
