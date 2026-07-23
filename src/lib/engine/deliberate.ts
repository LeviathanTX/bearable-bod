import { db, withUserContext } from '@/lib/db/client';
import { boardMembers, reviewSessions, sessionTakes, sessionVotes, objections, companies } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { converse, converseJson } from '@/lib/ai/converse';
import { buildReviewContext, ReviewContext } from './build-review-context';
import { storeMemory } from './company-memory';
import { embedText } from '@/lib/ai/embeddings';
import { checkAiCallCap } from '@/lib/rate-limit';
import { sql } from 'drizzle-orm';

// Per-seat model: Sonnet preferred for quality; falls back to Haiku if timing exceeds ceiling
const DEFAULT_SEAT_MODEL = 'us.anthropic.claude-sonnet-4-6';
const EXTRACTION_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const SYNTHESIS_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

interface BoardMemberRow {
  id: string;
  name: string;
  title: string;
  committeeRole: string | null;
  personaPrompt: string | null;
  seatContext: string | null;
  interrogationStyle: string | null;
  nonNegotiables: string | null;
  model: string | null;
}

interface ExtractedObjection {
  title: string;
  detail: string;
  severity: 'deal_killer' | 'major' | 'minor';
  lens: string;
  boardMemberId: string;
}

async function loadSessionAndSeats(orgId: string, sessionId: string): Promise<{ session: any; seats: BoardMemberRow[]; companyId: string }> {
  let session: any;
  let seats: BoardMemberRow[] = [];

  await withUserContext(orgId, 'all', async () => {
    const rows = await db.select().from(reviewSessions).where(eq(reviewSessions.id, sessionId)).limit(1);
    session = rows[0];
    if (!session) throw new Error('Session not found');

    const seatIds = (session.seatIds as string[]) || [];
    if (seatIds.length === 0) throw new Error('No seats selected');

    seats = await db.select().from(boardMembers)
      .where(and(eq(boardMembers.orgId, orgId), inArray(boardMembers.id, seatIds)));
  });

  return { session, seats, companyId: session.companyId };
}

export async function runSingleSeatInterrogation(
  orgId: string,
  sessionId: string,
  seatId: string,
  dailyCap: number,
): Promise<void> {
  const { session, seats, companyId } = await loadSessionAndSeats(orgId, sessionId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error(`Seat ${seatId} not found`);

  const query = session.focusPrompt || 'Full review of this company pitch and readiness';
  const context = await buildReviewContext(orgId, companyId, query);

  const capOk = await checkAiCallCap(orgId, dailyCap);
  if (!capOk) throw new Error('Daily AI call cap reached');

  await runInterrogation(orgId, sessionId, seat, context, query, session.founderStatement || undefined);
}

export async function runSingleSeatAdvise(
  orgId: string,
  sessionId: string,
  seatId: string,
  dailyCap: number,
): Promise<void> {
  const { session, seats, companyId } = await loadSessionAndSeats(orgId, sessionId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error(`Seat ${seatId} not found`);

  const query = session.focusPrompt || 'Full review of this company pitch and readiness';
  const context = await buildReviewContext(orgId, companyId, query);

  const capOk = await checkAiCallCap(orgId, dailyCap);
  if (!capOk) throw new Error('Daily AI call cap reached');

  // On first advise seat, extract objections from all interrogation takes
  const existingAdviseTakes = await withUserContext(orgId, 'all', () =>
    db.select({ boardMemberId: sessionTakes.boardMemberId })
      .from(sessionTakes)
      .where(and(eq(sessionTakes.sessionId, sessionId), eq(sessionTakes.phase, 'advise')))
  );

  if (existingAdviseTakes.length === 0) {
    const interrogationTakes = await withUserContext(orgId, 'all', () =>
      db.select().from(sessionTakes)
        .where(and(eq(sessionTakes.sessionId, sessionId), eq(sessionTakes.phase, 'interrogate')))
    );
    const interrogationResults = interrogationTakes.map((t) => ({
      boardMemberId: t.boardMemberId,
      content: t.content,
    }));
    await extractObjections(orgId, companyId, sessionId, interrogationResults, seats);
  }

  // Load all objections for the advise context
  const allObjections = await withUserContext(orgId, companyId, () =>
    db.select().from(objections).where(eq(objections.raisedInSession, sessionId))
  );
  const objectionList: ExtractedObjection[] = allObjections.map((o) => ({
    title: o.title,
    detail: o.detail || '',
    severity: o.severity as 'deal_killer' | 'major' | 'minor',
    lens: o.lens || '',
    boardMemberId: o.raisedBy || '',
  }));

  // Get this seat's interrogation take
  const myTake = await withUserContext(orgId, 'all', () =>
    db.select().from(sessionTakes)
      .where(and(
        eq(sessionTakes.sessionId, sessionId),
        eq(sessionTakes.phase, 'interrogate'),
        eq(sessionTakes.boardMemberId, seatId),
      ))
      .limit(1)
  );

  await runAdvise(orgId, sessionId, seat, context, objectionList, myTake[0]?.content || '');
}

export async function runSingleSeatCrossExamine(
  orgId: string,
  sessionId: string,
  seatId: string,
  dailyCap: number,
): Promise<void> {
  const { session, seats, companyId } = await loadSessionAndSeats(orgId, sessionId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error(`Seat ${seatId} not found`);

  const capOk = await checkAiCallCap(orgId, dailyCap);
  if (!capOk) throw new Error('Daily AI call cap reached');

  // Get all interrogation takes (others' takes for cross-examination)
  const allInterrogationTakes = await withUserContext(orgId, 'all', () =>
    db.select().from(sessionTakes)
      .where(and(eq(sessionTakes.sessionId, sessionId), eq(sessionTakes.phase, 'interrogate')))
  );

  const otherTakes = allInterrogationTakes
    .filter((t) => t.boardMemberId !== seatId)
    .map((t) => {
      const otherSeat = seats.find((s) => s.id === t.boardMemberId);
      return `[${otherSeat?.name} - ${otherSeat?.committeeRole}]:\n${t.content}`;
    })
    .join('\n\n');

  const myTake = allInterrogationTakes.find((t) => t.boardMemberId === seatId);

  const nonNeg = seat.nonNegotiables ? `\n\nYour non-negotiables (defend these):\n${seat.nonNegotiables}` : '';

  const systemPrompt = buildSeatSystemPrompt(seat, 'interrogate') +
    `\n\nYou are now in CROSS-EXAMINATION. Review your colleagues' interrogation takes and respond: Where do you disagree with their assessments? Where do they change your view? State any concession explicitly and defend your non-negotiables.${nonNeg}`;

  const result = await converse({
    model: seat.model || DEFAULT_SEAT_MODEL,
    systemPrompt,
    messages: [{
      role: 'user',
      content: `Your own interrogation:\n${myTake?.content || 'N/A'}\n\nYour colleagues' interrogations:\n${otherTakes}`,
    }],
    maxTokens: 800,
    temperature: 0.7,
  });

  await withUserContext(orgId, 'all', async () => {
    await db.insert(sessionTakes).values({
      sessionId,
      boardMemberId: seat.id,
      phase: 'cross_examine',
      content: result.content,
      tokensUsed: result.tokensUsed,
    });
  });
}

export async function runSingleSeatVote(
  orgId: string,
  sessionId: string,
  seatId: string,
  dailyCap: number,
): Promise<void> {
  const { session, seats, companyId } = await loadSessionAndSeats(orgId, sessionId);
  const seat = seats.find((s) => s.id === seatId);
  if (!seat) throw new Error(`Seat ${seatId} not found`);

  const capOk = await checkAiCallCap(orgId, dailyCap);
  if (!capOk) throw new Error('Daily AI call cap reached');

  // Load all takes for context
  const allTakes = await withUserContext(orgId, 'all', () =>
    db.select().from(sessionTakes).where(eq(sessionTakes.sessionId, sessionId))
  );

  const myTakes = allTakes.filter((t) => t.boardMemberId === seatId);
  const myContext = myTakes.map((t) => `[${t.phase}]: ${t.content}`).join('\n\n');

  const allObjections = await withUserContext(orgId, companyId, () =>
    db.select().from(objections).where(eq(objections.raisedInSession, sessionId))
  );

  const objSummary = allObjections
    .map((o) => `[${o.severity}] ${o.title}: ${(o.detail || '').slice(0, 100)}`)
    .join('\n');

  const nonNeg = seat.nonNegotiables ? `\n\nYour non-negotiables:\n${seat.nonNegotiables}` : '';

  interface VoteOutput { vote: string; rationale: string; conditions: string[] }

  const { data: voteData } = await converseJson<VoteOutput>({
    model: seat.model || DEFAULT_SEAT_MODEL,
    maxTokens: 600,
    systemPrompt: buildSeatSystemPrompt(seat, 'advise') +
      `\n\nYou are now VOTING on whether this vendor should proceed. Return JSON: {"vote": "YES"|"YES_WITH_CONDITIONS"|"NO", "rationale": "one paragraph", "conditions": ["list of conditions if applicable"]}. Base your vote on all evidence including cross-examination. Mixed votes and NO are legitimate outcomes - never bias toward approval.${nonNeg}`,
    userMessage: `Your assessment across phases:\n${myContext}\n\nAll objections:\n${objSummary}`,
  });

  await withUserContext(orgId, 'all', async () => {
    await db.insert(sessionVotes).values({
      sessionId,
      boardMemberId: seat.id,
      vote: voteData.vote || 'NO',
      rationale: voteData.rationale || '',
      conditions: voteData.conditions || [],
    });
  });
}

export async function runInterrogationPhase(
  orgId: string,
  sessionId: string,
  dailyCap: number,
): Promise<void> {
  const { session, seats, companyId } = await loadSessionAndSeats(orgId, sessionId);
  const query = session.focusPrompt || 'Full review of this company pitch and readiness';
  const context = await buildReviewContext(orgId, companyId, query);

  const capOk = await checkAiCallCap(orgId, dailyCap);
  if (!capOk) throw new Error('Daily AI call cap reached');

  await Promise.all(
    seats.map((seat) => runInterrogation(orgId, sessionId, seat, context, query))
  );

  await withUserContext(orgId, companyId, async () => {
    await db.update(reviewSessions).set({ phase: 'advise' }).where(eq(reviewSessions.id, sessionId));
  });
}

export async function runAdvisePhase(
  orgId: string,
  sessionId: string,
  dailyCap: number,
): Promise<void> {
  const { session, seats, companyId } = await loadSessionAndSeats(orgId, sessionId);
  const query = session.focusPrompt || 'Full review of this company pitch and readiness';
  const context = await buildReviewContext(orgId, companyId, query);

  const capOk = await checkAiCallCap(orgId, dailyCap);
  if (!capOk) throw new Error('Daily AI call cap reached');

  // Load interrogation takes for this session
  const interrogationTakes = await withUserContext(orgId, 'all', () =>
    db.select().from(sessionTakes)
      .where(and(eq(sessionTakes.sessionId, sessionId), eq(sessionTakes.phase, 'interrogate')))
  );

  const interrogationResults = interrogationTakes.map((t) => ({
    boardMemberId: t.boardMemberId,
    content: t.content,
  }));

  // Extract objections from interrogation
  const allObjections = await extractObjections(orgId, companyId, sessionId, interrogationResults, seats);

  // Run advise in parallel
  await Promise.all(
    seats.map((seat) => {
      const myTake = interrogationResults.find((r) => r.boardMemberId === seat.id);
      return runAdvise(orgId, sessionId, seat, context, allObjections, myTake?.content || '');
    })
  );
}

export async function runSynthesisPhase(
  orgId: string,
  sessionId: string,
  dailyCap: number,
): Promise<void> {
  const { session, seats, companyId } = await loadSessionAndSeats(orgId, sessionId);
  const query = session.focusPrompt || 'Full review of this company pitch and readiness';
  const context = await buildReviewContext(orgId, companyId, query);

  const capOk = await checkAiCallCap(orgId, dailyCap);
  if (!capOk) throw new Error('Daily AI call cap reached');

  // Load takes from DB
  const allTakes = await withUserContext(orgId, 'all', () =>
    db.select().from(sessionTakes).where(eq(sessionTakes.sessionId, sessionId))
  );

  const interrogationResults = allTakes
    .filter((t) => t.phase === 'interrogate')
    .map((t) => ({ boardMemberId: t.boardMemberId, content: t.content }));

  const adviseResults = allTakes
    .filter((t) => t.phase === 'advise')
    .map((t) => ({ boardMemberId: t.boardMemberId, content: t.content }));

  const crossExamResults = allTakes
    .filter((t) => t.phase === 'cross_examine')
    .map((t) => ({ boardMemberId: t.boardMemberId, content: t.content }));

  // Load objections for this session
  const allObjections = await withUserContext(orgId, companyId, () =>
    db.select().from(objections)
      .where(eq(objections.raisedInSession, sessionId))
  );

  const objectionSummary: ExtractedObjection[] = allObjections.map((o) => ({
    title: o.title,
    detail: o.detail || '',
    severity: o.severity as 'deal_killer' | 'major' | 'minor',
    lens: o.lens || '',
    boardMemberId: o.raisedBy || '',
  }));

  // Load votes
  const votes = await withUserContext(orgId, 'all', () =>
    db.select().from(sessionVotes).where(eq(sessionVotes.sessionId, sessionId))
  );

  await runChairSynthesis(orgId, sessionId, companyId, context, interrogationResults, adviseResults, crossExamResults, objectionSummary, votes, seats);

  await storeMemory(
    orgId,
    companyId,
    'progress_note',
    `Session completed. ${objectionSummary.length} objections raised/updated.`,
    'session',
    0.7,
  );
}

// Legacy single-call function (kept for test compatibility)
export async function runDeliberation(
  orgId: string,
  sessionId: string,
  dailyCap: number,
): Promise<void> {
  await runInterrogationPhase(orgId, sessionId, dailyCap);
  await runAdvisePhase(orgId, sessionId, dailyCap);
  await runSynthesisPhase(orgId, sessionId, dailyCap);
}

async function runInterrogation(
  orgId: string,
  sessionId: string,
  seat: BoardMemberRow,
  context: ReviewContext,
  query: string,
  founderStatement?: string,
): Promise<{ boardMemberId: string; content: string }> {
  const systemPrompt = buildSeatSystemPrompt(seat, 'interrogate');
  const userMessage = buildContextMessage(context, query, founderStatement);

  const result = await converse({
    model: seat.model || DEFAULT_SEAT_MODEL,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 800,
    temperature: 0.7,
  });

  await withUserContext(orgId, 'all', async () => {
    await db.insert(sessionTakes).values({
      sessionId,
      boardMemberId: seat.id,
      phase: 'interrogate',
      content: result.content,
      tokensUsed: result.tokensUsed,
    });
  });

  return { boardMemberId: seat.id, content: result.content };
}

async function runAdvise(
  orgId: string,
  sessionId: string,
  seat: BoardMemberRow,
  context: ReviewContext,
  allObjections: ExtractedObjection[],
  myInterrogation: string,
): Promise<{ boardMemberId: string; content: string }> {
  const systemPrompt = buildSeatSystemPrompt(seat, 'advise');
  const objectionSummary = allObjections
    .map((o) => `[${o.severity}] ${o.title} (${o.lens}): ${o.detail.slice(0, 150)}`)
    .join('\n');

  const userMessage = `Your interrogation:\n${myInterrogation}\n\nAll raised objections:\n${objectionSummary}\n\nNow advise the founder: what specifically fixes your objections and strengthens their position?`;

  const result = await converse({
    model: seat.model || DEFAULT_SEAT_MODEL,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 800,
    temperature: 0.7,
  });

  await withUserContext(orgId, 'all', async () => {
    await db.insert(sessionTakes).values({
      sessionId,
      boardMemberId: seat.id,
      phase: 'advise',
      content: result.content,
      tokensUsed: result.tokensUsed,
    });
  });

  return { boardMemberId: seat.id, content: result.content };
}

async function extractObjections(
  orgId: string,
  companyId: string,
  sessionId: string,
  interrogationResults: { boardMemberId: string; content: string }[],
  seats: BoardMemberRow[],
): Promise<ExtractedObjection[]> {
  const combined = interrogationResults.map((r) => {
    const seat = seats.find((s) => s.id === r.boardMemberId);
    return `[${seat?.name} - ${seat?.committeeRole}]:\n${r.content}`;
  }).join('\n\n');

  const { data: extracted } = await converseJson<ExtractedObjection[]>({
    model: EXTRACTION_MODEL,
    maxTokens: 2000,
    systemPrompt: `Extract objections from board interrogations. Return a JSON array. Each item: { "title": "short title", "detail": "one sentence", "severity": "deal_killer"|"major"|"minor", "lens": "the committee role raising it", "boardMemberId": "the seat ID" }. Only include genuine objections, not positive feedback. Maximum 20 objections total.`,
    userMessage: `Seats and their IDs:\n${seats.map((s) => `${s.id}: ${s.name} (${s.committeeRole})`).join('\n')}\n\nInterrogation transcripts:\n${combined}`,
  });

  // Dedupe: embed all new objection titles in parallel, compare against existing
  const existingObjections = await withUserContext(orgId, companyId, () =>
    db.select().from(objections)
      .where(and(eq(objections.companyId, companyId)))
  );

  const unresolvedExisting = existingObjections.filter((o) => o.state !== 'resolved');

  // Batch embed: new titles + existing titles in parallel
  let newEmbeddings: (number[] | null)[] = [];
  let existingEmbeddings: (number[] | null)[] = [];

  if (unresolvedExisting.length > 0) {
    try {
      const [newEmbs, existEmbs] = await Promise.all([
        Promise.all(extracted.map((o) => embedText(o.title).catch(() => null))),
        Promise.all(unresolvedExisting.map((o) => embedText(o.title).catch(() => null))),
      ]);
      newEmbeddings = newEmbs;
      existingEmbeddings = existEmbs;
    } catch {
      // Keyword fallback below
    }
  }

  for (let i = 0; i < extracted.length; i++) {
    const obj = extracted[i];
    let isDuplicate = false;

    if (unresolvedExisting.length > 0) {
      const newEmb = newEmbeddings[i];

      for (let j = 0; j < unresolvedExisting.length; j++) {
        const existing = unresolvedExisting[j];
        let similar = false;

        // Embedding-based dedup (threshold 0.85)
        if (newEmb && existingEmbeddings[j]) {
          const sim = cosineSimilarity(newEmb, existingEmbeddings[j]!);
          similar = sim >= 0.85;
        }

        // Keyword fallback if embeddings unavailable
        if (!newEmb || !existingEmbeddings[j]) {
          const words = existing.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          const newLower = obj.title.toLowerCase();
          similar = words.filter((w) => newLower.includes(w)).length >= 2;
        }

        if (similar) {
          const history = (existing.stateHistory as any[]) || [];
          history.push({ state: existing.state, sessionId, note: 'Re-raised in session', at: new Date().toISOString() });
          await withUserContext(orgId, companyId, () =>
            db.update(objections)
              .set({ lastReviewedIn: sessionId, stateHistory: history, updatedAt: new Date() })
              .where(eq(objections.id, existing.id))
          );
          isDuplicate = true;
          break;
        }
      }
    }

    if (!isDuplicate) {
      await withUserContext(orgId, companyId, () =>
        db.insert(objections).values({
          orgId,
          companyId,
          raisedInSession: sessionId,
          raisedBy: obj.boardMemberId,
          lens: obj.lens,
          title: obj.title,
          detail: obj.detail,
          severity: obj.severity,
          state: 'open',
          stateHistory: [{ state: 'open', sessionId, note: 'Raised', at: new Date().toISOString() }],
          lastReviewedIn: sessionId,
        })
      );
    }
  }

  return extracted;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

interface SynthesisOutput {
  agreements: string[];
  disagreements: string[];
  punchList: { title: string; lens: string; severity: string; fix: string; deadline?: string }[];
  readinessNote: string;
  objectionUpdates: { title: string; newState: string; reason: string }[];
}

async function runChairSynthesis(
  orgId: string,
  sessionId: string,
  companyId: string,
  context: ReviewContext,
  interrogations: { boardMemberId: string; content: string }[],
  adviseResults: { boardMemberId: string; content: string }[],
  crossExamResults: { boardMemberId: string; content: string }[],
  allObjections: ExtractedObjection[],
  votes: { boardMemberId: string; vote: string; rationale: string | null; conditions: any }[],
  seats: BoardMemberRow[],
): Promise<string> {
  const interrogationText = interrogations.map((r) => r.content).join('\n---\n');
  const adviseText = adviseResults.map((r) => r.content).join('\n---\n');
  const crossExamText = crossExamResults.map((r) => {
    const seat = seats.find((s) => s.id === r.boardMemberId);
    return `[${seat?.name}]: ${r.content}`;
  }).join('\n---\n');

  const voteText = votes.map((v) => {
    const seat = seats.find((s) => s.id === v.boardMemberId);
    return `${seat?.name}: ${v.vote} - ${v.rationale || ''}`;
  }).join('\n');

  const { data: synthesis } = await converseJson<SynthesisOutput>({
    model: SYNTHESIS_MODEL,
    maxTokens: 2000,
    systemPrompt: `You are the Chair synthesizing a board review session. Return a JSON object with this exact structure:
{
  "agreements": ["string - areas where board members agree"],
  "disagreements": ["string - areas where board members disagree, never averaged away"],
  "punchList": [{"title": "short title", "lens": "which role", "severity": "deal_killer|major|minor", "fix": "what specifically fixes it", "deadline": "optional timeframe"}],
  "readinessNote": "one paragraph assessing current state",
  "objectionUpdates": [{"title": "objection title", "newState": "addressed|resolved|still_weak", "reason": "why"}]
}
Rank punchList by severity (deal_killers first). Surface disagreements explicitly. Incorporate vote outcomes and cross-examination concessions.`,
    userMessage: `Company: ${context.company.name}\nStage: ${context.company.stage}\n\nInterrogation:\n${interrogationText}\n\nCross-Examination:\n${crossExamText || 'N/A'}\n\nAdvise:\n${adviseText}\n\nVotes:\n${voteText || 'N/A'}\n\nObjections:\n${context.openObjections}`,
  });

  // Build human-readable synthesis text from structured data
  const synthText = formatSynthesis(synthesis, context.company.name);

  await withUserContext(orgId, companyId, async () => {
    await db.update(reviewSessions).set({
      phase: 'synthesized',
      status: 'complete',
      synthesis: synthText,
      punchList: synthesis.punchList,
      updatedAt: new Date(),
    }).where(eq(reviewSessions.id, sessionId));

    if (synthesis.readinessNote) {
      await db.update(companies).set({
        readinessNote: synthesis.readinessNote,
        updatedAt: new Date(),
      }).where(eq(companies.id, companyId));
    }
  });

  return synthText;
}

function formatSynthesis(s: SynthesisOutput, companyName: string): string {
  const lines: string[] = [`# ${companyName} - Board Synthesis\n`];

  lines.push('## Agreements');
  s.agreements.forEach((a) => lines.push(`- ${a}`));

  lines.push('\n## Disagreements');
  s.disagreements.forEach((d) => lines.push(`- ${d}`));

  lines.push('\n## Punch List');
  s.punchList.forEach((p, i) => lines.push(`${i + 1}. [${p.severity}] ${p.title} (${p.lens}) - ${p.fix}${p.deadline ? ` [${p.deadline}]` : ''}`));

  lines.push('\n## Readiness Note');
  lines.push(s.readinessNote);

  if (s.objectionUpdates.length > 0) {
    lines.push('\n## Objection Status Updates');
    s.objectionUpdates.forEach((u) => lines.push(`- "${u.title}" -> ${u.newState} (${u.reason})`));
  }

  return lines.join('\n');
}

function buildSeatSystemPrompt(seat: BoardMemberRow, phase: 'interrogate' | 'advise'): string {
  const persona = seat.personaPrompt || `You are ${seat.name}, ${seat.title}.`;
  const context = seat.seatContext ? `\n\nContext for your role:\n${seat.seatContext}` : '';
  const style = seat.interrogationStyle ? `\n\nYour style: ${seat.interrogationStyle}` : '';

  if (phase === 'interrogate') {
    return `${persona}${context}${style}\n\nYou are on a buying committee. Interrogate this pitch. For each concern, state: severity (deal_killer/major/minor), title, and 1-2 sentence explanation. Be direct, no preamble. Maximum 6 objections.`;
  }

  return `${persona}${context}${style}\n\nYou just interrogated this pitch. Now advise the founder: for each of your objections, state the specific fix in 1-2 sentences. Be direct, no preamble.`;
}

function buildContextMessage(context: ReviewContext, query: string, founderStatement?: string): string {
  const orgCtx = context.company.orgContext
    ? `\nBuying organization profile: ${JSON.stringify(context.company.orgContext)}`
    : '';

  const founderPres = founderStatement
    ? `\n\nFounder's presentation to the board:\n${founderStatement}`
    : '';

  return `Company: ${context.company.name}
One-liner: ${context.company.oneLiner || 'Not provided'}
Target buyer: ${context.company.targetBuyer || 'Not specified'}
Stage: ${context.company.stage}
Previous readiness: ${context.company.readinessNote || 'First review'}${orgCtx}

Open objections from prior sessions:
${context.openObjections}

Prior session syntheses:
${context.priorSyntheses}

Company memory:
${context.companyMemoryContext}

Relevant document excerpts:
${context.relevantChunks}

Previous punch list:
${context.previousPunchList}${founderPres}

${query !== 'Full review of this company pitch and readiness' ? `Focus: ${query}` : 'Conduct a full review.'}`;
}
