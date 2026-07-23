import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getAwsClientConfig } from '@/lib/aws-config';
import { converse } from '@/lib/ai/converse';
import { db, withUserContext } from '@/lib/db/client';
import { reviewSessions, sessionTakes, sessionVotes, boardMembers, companies, objections } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

const S3_BUCKET = process.env.S3_BUCKET_DOCUMENTS || 'preboard-documents-996596548730';
const SYNTHESIS_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

interface DeliverableResult {
  type: 'governance_simulation' | 'business_case' | 'founder_deck';
  s3Key: string;
  filename: string;
}

async function loadSessionData(orgId: string, sessionId: string) {
  let session: any;
  let takes: any[] = [];
  let votes: any[] = [];
  let seats: any[] = [];
  let company: any;
  let sessionObjections: any[] = [];

  await withUserContext(orgId, 'all', async () => {
    const rows = await db.select().from(reviewSessions).where(eq(reviewSessions.id, sessionId)).limit(1);
    session = rows[0];
    if (!session) throw new Error('Session not found');

    takes = await db.select().from(sessionTakes).where(eq(sessionTakes.sessionId, sessionId));
    votes = await db.select().from(sessionVotes).where(eq(sessionVotes.sessionId, sessionId));

    const seatIds = (session.seatIds as string[]) || [];
    if (seatIds.length > 0) {
      seats = await db.select().from(boardMembers).where(inArray(boardMembers.id, seatIds));
    }
  });

  await withUserContext(orgId, session.companyId, async () => {
    const rows = await db.select().from(companies).where(eq(companies.id, session.companyId)).limit(1);
    company = rows[0];
    sessionObjections = await db.select().from(objections).where(eq(objections.raisedInSession, sessionId));
  });

  return { session, takes, votes, seats, company, objections: sessionObjections };
}

function getSeatName(seats: any[], id: string): string {
  return seats.find((s: any) => s.id === id)?.name || 'Unknown';
}

export async function generateGovernanceSimulation(orgId: string, sessionId: string): Promise<DeliverableResult> {
  const { session, takes, votes, seats, company, objections: sessionObjections } = await loadSessionData(orgId, sessionId);

  const interrogationTakes = takes.filter((t) => t.phase === 'interrogate');
  const crossExamTakes = takes.filter((t) => t.phase === 'cross_examine');
  const adviseTakes = takes.filter((t) => t.phase === 'advise');
  const punchList = (session.punchList || []) as any[];

  const children: any[] = [];

  // Cover
  children.push(
    new Paragraph({ text: company?.name || 'Company', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: 'Governance Simulation Document', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: `Generated: ${new Date().toLocaleDateString()}`, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: '' }),
  );

  // Executive Summary
  children.push(
    new Paragraph({ text: 'Executive Summary', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: session.synthesis || 'No synthesis available.' }),
    new Paragraph({ text: '' }),
  );

  // Vote Record
  children.push(new Paragraph({ text: 'Board Vote Record', heading: HeadingLevel.HEADING_1 }));
  for (const vote of votes) {
    const name = getSeatName(seats, vote.boardMemberId);
    children.push(
      new Paragraph({ children: [new TextRun({ text: `${name}: `, bold: true }), new TextRun(vote.vote)] }),
      new Paragraph({ text: vote.rationale || '', indent: { left: 720 } }),
    );
    if (vote.conditions?.length) {
      for (const cond of vote.conditions as string[]) {
        children.push(new Paragraph({ text: `  - ${cond}`, indent: { left: 1440 } }));
      }
    }
  }
  children.push(new Paragraph({ text: '' }));

  // Pre-engagement Conditions
  const conditions = votes.flatMap((v: any) => (v.conditions || []) as string[]);
  if (conditions.length > 0) {
    children.push(new Paragraph({ text: 'Pre-Engagement Conditions', heading: HeadingLevel.HEADING_1 }));
    conditions.forEach((c, i) => children.push(new Paragraph({ text: `${i + 1}. ${c}` })));
    children.push(new Paragraph({ text: '' }));
  }

  // Punch List
  if (punchList.length > 0) {
    children.push(new Paragraph({ text: 'Punch List', heading: HeadingLevel.HEADING_1 }));
    for (const item of punchList) {
      const text = typeof item === 'string' ? item : `[${item.severity}] ${item.title} (${item.lens}) - ${item.fix}`;
      children.push(new Paragraph({ text }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  // Appendix: Cross-Examination Transcript
  children.push(new Paragraph({ text: 'Appendix: Cross-Examination Transcript', heading: HeadingLevel.HEADING_1 }));
  for (const take of crossExamTakes) {
    const name = getSeatName(seats, take.boardMemberId);
    children.push(
      new Paragraph({ children: [new TextRun({ text: `${name}:`, bold: true })] }),
      new Paragraph({ text: take.content }),
      new Paragraph({ text: '' }),
    );
  }

  // Board Resolution
  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Board Resolution', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: `Date: ${new Date().toLocaleDateString()}`, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: '' }),
  );
  for (const seat of seats) {
    children.push(new Paragraph({ text: `_________________________    ${seat.name}, ${seat.title}` }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  const s3Key = `deliverables/${sessionId}/governance-simulation.docx`;
  await uploadToS3(s3Key, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  return { type: 'governance_simulation', s3Key, filename: 'governance-simulation.docx' };
}

export async function generateBusinessCase(orgId: string, sessionId: string): Promise<DeliverableResult> {
  const { session, takes, votes, seats, company, objections: sessionObjections } = await loadSessionData(orgId, sessionId);

  const context = `Company: ${company?.name}\nOne-liner: ${company?.oneLiner || 'N/A'}\nSynthesis: ${session.synthesis?.slice(0, 2000) || 'N/A'}\nPunch list: ${JSON.stringify(session.punchList || []).slice(0, 1000)}`;

  const result = await converse({
    model: SYNTHESIS_MODEL,
    systemPrompt: `Generate a PMO business case intake document. Sections exactly: Project Overview, Executive Summary, Scope (including explicit Out-of-Scope), Financial & Resource Overview, ROI Assessment, Integration Considerations, Consequences of Inaction, High-Level Milestones, Stakeholders. Write neutrally (intake document, not promotion). Use the session findings as source material. Maximum 2000 words.`,
    messages: [{ role: 'user', content: context }],
    maxTokens: 2000,
    temperature: 0.4,
  });

  const sections = result.content.split(/\n##?\s+/).filter(Boolean);
  const children: any[] = [];

  children.push(
    new Paragraph({ text: `${company?.name} - Business Case`, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: `Generated: ${new Date().toLocaleDateString()}`, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: '' }),
  );

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0];
    const body = lines.slice(1).join('\n').trim();
    children.push(
      new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: body }),
      new Paragraph({ text: '' }),
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  const s3Key = `deliverables/${sessionId}/business-case.docx`;
  await uploadToS3(s3Key, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  return { type: 'business_case', s3Key, filename: 'business-case.docx' };
}

export async function generateFounderDeck(orgId: string, sessionId: string): Promise<DeliverableResult> {
  const { session, takes, votes, seats, company, objections: sessionObjections } = await loadSessionData(orgId, sessionId);

  const pptx = new PptxGenJS();
  const accentColor = '0E7C66';

  // Slide 1: Title + Verdict
  const slide1 = pptx.addSlide();
  slide1.addText(company?.name || 'Company', { x: 0.5, y: 1, w: 9, h: 1.5, fontSize: 28, bold: true, color: '101418' });
  const yesVotes = votes.filter((v: any) => v.vote === 'YES' || v.vote === 'YES_WITH_CONDITIONS').length;
  const noVotes = votes.filter((v: any) => v.vote === 'NO').length;
  const verdict = noVotes === 0 ? 'APPROVED' : yesVotes > noVotes ? 'CONDITIONAL' : 'NOT RECOMMENDED';
  slide1.addText(`Verdict: ${verdict}`, { x: 0.5, y: 2.5, w: 9, h: 1, fontSize: 20, color: accentColor });

  // Slide 2: Vote Tally
  const slide2 = pptx.addSlide();
  slide2.addText('Board Vote', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 24, bold: true });
  const voteLines = votes.map((v: any) => `${getSeatName(seats, v.boardMemberId)}: ${v.vote}`).join('\n');
  slide2.addText(voteLines, { x: 0.5, y: 1.2, w: 9, h: 4, fontSize: 14, valign: 'top' });

  // Slide 3-6: Top objections by lens
  const punchList = (session.punchList || []) as any[];
  const dealKillers = punchList.filter((p: any) => p.severity === 'deal_killer');
  const majors = punchList.filter((p: any) => p.severity === 'major');

  if (dealKillers.length > 0) {
    const slide = pptx.addSlide();
    slide.addText('Deal Killers', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 24, bold: true, color: 'CC0000' });
    const items = dealKillers.slice(0, 5).map((p: any) => `- ${p.title}: ${p.fix || ''}`).join('\n');
    slide.addText(items, { x: 0.5, y: 1.2, w: 9, h: 4, fontSize: 12, valign: 'top' });
  }

  if (majors.length > 0) {
    const slide = pptx.addSlide();
    slide.addText('Major Issues', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 24, bold: true, color: 'CC6600' });
    const items = majors.slice(0, 5).map((p: any) => `- ${p.title}: ${p.fix || ''}`).join('\n');
    slide.addText(items, { x: 0.5, y: 1.2, w: 9, h: 4, fontSize: 12, valign: 'top' });
  }

  // Slide: What to fix before the real room
  const fixSlide = pptx.addSlide();
  fixSlide.addText('Before the Real Room', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 24, bold: true });
  const fixItems = punchList.slice(0, 6).map((p: any) => {
    const text = typeof p === 'string' ? p : `${p.title}${p.deadline ? ` [${p.deadline}]` : ''}`;
    return `- ${text}`;
  }).join('\n');
  fixSlide.addText(fixItems || 'No action items.', { x: 0.5, y: 1.2, w: 9, h: 4, fontSize: 12, valign: 'top' });

  // Slide: Path to Yes
  const pathSlide = pptx.addSlide();
  pathSlide.addText('Path to Yes', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 24, bold: true, color: accentColor });
  const conditions = votes.flatMap((v: any) => (v.conditions || []) as string[]);
  const pathText = conditions.length > 0
    ? conditions.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : 'Address all deal-killer objections and re-present.';
  pathSlide.addText(pathText, { x: 0.5, y: 1.2, w: 9, h: 4, fontSize: 12, valign: 'top' });

  const buffer = Buffer.from(await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer);
  const s3Key = `deliverables/${sessionId}/founder-deck.pptx`;
  await uploadToS3(s3Key, buffer, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

  return { type: 'founder_deck', s3Key, filename: 'founder-deck.pptx' };
}

async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  const s3 = new S3Client(getAwsClientConfig());
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}
