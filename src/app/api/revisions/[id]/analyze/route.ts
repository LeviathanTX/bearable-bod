import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { deliverableRevisions, orgStyleNotes, refinementProposals, boardMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getAwsClientConfig } from '@/lib/aws-config';
import { DOCUMENTS_BUCKET } from '@/lib/s3';
import { converse } from '@/lib/ai/converse';

const ANALYSIS_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = requireOperator(await resolveSession());
  const { id: revisionId } = await params;

  const revisions = await withUserContext(session.orgId, 'all', () =>
    db.select().from(deliverableRevisions)
      .where(and(eq(deliverableRevisions.id, revisionId), eq(deliverableRevisions.orgId, session.orgId)))
      .limit(1)
  );

  if (revisions.length === 0) {
    return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
  }

  const revision = revisions[0];

  // Idempotent: check if style note already exists for this revision
  const existing = await withUserContext(session.orgId, 'all', () =>
    db.select({ id: orgStyleNotes.id }).from(orgStyleNotes)
      .where(eq(orgStyleNotes.sourceRevisionId, revisionId))
      .limit(1)
  );

  if (existing.length > 0) {
    return NextResponse.json({ status: 'already_analyzed', styleNoteId: existing[0].id });
  }

  // Fetch edited file from S3
  const s3 = new S3Client(getAwsClientConfig());
  const editedObj = await s3.send(new GetObjectCommand({
    Bucket: DOCUMENTS_BUCKET,
    Key: revision.editedS3Key!,
  }));

  const editedBuffer = await editedObj.Body?.transformToByteArray();
  if (!editedBuffer) {
    return NextResponse.json({ error: 'Could not read edited file' }, { status: 500 });
  }

  const editedText = Buffer.from(editedBuffer).toString('utf8').slice(0, 4000);

  // Run editorial diff analysis
  const result = await converse({
    model: ANALYSIS_MODEL,
    systemPrompt: `Analyze the editorial style of this document revision. Summarize the operator's editorial preferences in 2-3 sentences: tone changes, structural preferences, sections added or removed, formatting choices. Be specific and actionable.`,
    messages: [{ role: 'user', content: `Edited document content (partial):\n${editedText}` }],
    maxTokens: 400,
    temperature: 0.3,
  });

  // Store style note
  const styleNote = await withUserContext(session.orgId, 'all', () =>
    db.insert(orgStyleNotes).values({
      orgId: session.orgId,
      note: result.content,
      sourceRevisionId: revisionId,
    }).returning()
  );

  // Create refinement proposal for the most relevant board member
  const seats = await withUserContext(session.orgId, 'all', () =>
    db.select({ id: boardMembers.id, name: boardMembers.name })
      .from(boardMembers)
      .where(and(eq(boardMembers.orgId, session.orgId), eq(boardMembers.active, true)))
      .limit(1)
  );

  let proposalId: string | null = null;
  if (seats.length > 0) {
    const proposals = await withUserContext(session.orgId, 'all', () =>
      db.insert(refinementProposals).values({
        orgId: session.orgId,
        boardMemberId: seats[0].id,
        sourceSessionIds: [revision.sessionId],
        proposal: `Based on editorial revision: ${result.content}`,
        rationale: `Operator edited the ${revision.deliverableType} deliverable, showing preference for this style.`,
        status: 'pending',
      }).returning()
    );
    proposalId = proposals[0]?.id || null;
  }

  return NextResponse.json({
    styleNote: styleNote[0],
    proposalId,
  });
}
