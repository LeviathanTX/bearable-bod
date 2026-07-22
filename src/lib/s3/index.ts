import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
  }
  return s3Client;
}

const BUCKET = process.env.S3_BUCKET_DOCUMENTS || 'preboard-documents-996596548730';

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  await getS3().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function getSignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(getS3(), command, { expiresIn: 3600 });
}

export function buildS3Key(orgId: string, companyId: string, filename: string): string {
  const ts = Date.now().toString(36);
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${orgId}/${companyId}/${ts}-${safe}`;
}
