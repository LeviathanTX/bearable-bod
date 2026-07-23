import { db, withUserContext } from '@/lib/db/client';
import { boardMembers, reviewSessions, sessionTakes, objections, companies } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { converse, converseJson } from '@/lib/ai/converse';
import { buildReviewContext, ReviewContext } from './build-review-context';
import { storeMemory } from './company-memory';
import { embedText, vectorLiteral } from '@/lib/ai/embeddings';
import { checkAiCallCap } from '@/lib/rate-limit';
import { sql } from 'drizzle-orm';

interface BoardMemberRow {
  id: string;
  name: string;
  title: string;
  committeeRole: string | null;
  personaPrompt: string | null;
  seatContext: string | null;
  interrogationStyle: string | null;
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

  await runInterrogation(orgId, sessionId, seat, context, query);
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

  await runChairSynthesis(orgId, sessionId, companyId, context, interrogationResults, adviseResults, objectionSummary);

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
): Promise<{ boardMemberId: string; content: string }> {
  const systemPrompt = buildSeatSystemPrompt(seat, 'interrogate');
  const userMessage = buildContextMessage(context, query);

  const result = await converse({
    model: seat.model || 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
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
    model: seat.model || 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
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
    model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    maxTokens: 2000,
    systemPrompt: `Extract objections from board interrogations. Return a JSON array. Each item: { "title": "short title", "detail": "one sentence", "severity": "deal_killer"|"major"|"minor", "lens": "the committee role raising it", "boardMemberId": "the seat ID" }. Only include genuine objections, not positive feedback. Maximum 20 objections total.`,
    userMessage: `Seats and their IDs:\n${seats.map((s) => `${s.id}: ${s.name} (${s.committeeRole})`).join('\n')}\n\nInterrogation transcripts:\n${combined}`,
  });

  // Dedupe against existing objections
  const existingObjections = await withUserContext(orgId, companyId, () =>
    db.select().from(objections)
      .where(and(eq(objections.companyId, companyId)))
  );

  for (const obj of extracted) {
    let isDuplicate = false;

    if (existingObjections.length > 0) {
      try {
        for (const existing of existingObjections) {
          if (existing.state === 'resolved') continue;
          const titleOverlap = obj.title.toLowerCase().includes(existing.title.toLowerCase().split(' ')[0]);
          if (titleOverlap) {
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
      } catch {
        // proceed without dedup
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

async function runChairSynthesis(
  orgId: string,
  sessionId: string,
  companyId: string,
  context: ReviewContext,
  interrogations: { boardMemberId: string; content: string }[],
  adviseResults: { boardMemberId: string; content: string }[],
  allObjections: ExtractedObjection[],
): Promise<string> {
  const systemPrompt = `You are the Chair synthesizing a board review session. Your job:
1. Identify where board members AGREE and where they DISAGREE (surface disagreements explicitly, never average them away)
2. Produce an updated punch list ranked by severity (deal_killers first)
3. Write a one-paragraph readiness note assessing this company's current state
4. For each existing open objection, mark whether it should be: addressed, resolved, or still_weak

Format your response as:
## Agreements
...
## Disagreements
...
## Punch List
1. [severity] title - what fixes it
...
## Readiness Note
...
## Objection Status Updates
- "objection title" -> new_state (reason)
...`;

  const interrogationText = interrogations.map((r) => r.content).join('\n---\n');
  const adviseText = adviseResults.map((r) => r.content).join('\n---\n');

  const result = await converse({
    model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    systemPrompt,
    messages: [{
      role: 'user',
      content: `Company: ${context.company.name}\nStage: ${context.company.stage}\n\nInterrogation phase:\n${interrogationText}\n\nAdvise phase:\n${adviseText}\n\nCurrent objections:\n${context.openObjections}`,
    }],
    maxTokens: 1200,
    temperature: 0.5,
  });

  const punchListMatch = result.content.match(/## Punch List\n([\s\S]*?)(?=\n## |$)/);
  const punchItems = punchListMatch ? punchListMatch[1].trim().split('\n').filter(Boolean) : [];

  const readinessMatch = result.content.match(/## Readiness Note\n([\s\S]*?)(?=\n## |$)/);
  const readinessNote = readinessMatch ? readinessMatch[1].trim() : null;

  await withUserContext(orgId, companyId, async () => {
    await db.update(reviewSessions).set({
      phase: 'synthesized',
      status: 'complete',
      synthesis: result.content,
      punchList: punchItems,
      updatedAt: new Date(),
    }).where(eq(reviewSessions.id, sessionId));

    if (readinessNote) {
      await db.update(companies).set({
        readinessNote,
        updatedAt: new Date(),
      }).where(eq(companies.id, companyId));
    }
  });

  return result.content;
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

function buildContextMessage(context: ReviewContext, query: string): string {
  return `Company: ${context.company.name}
One-liner: ${context.company.oneLiner || 'Not provided'}
Target buyer: ${context.company.targetBuyer || 'Not specified'}
Stage: ${context.company.stage}
Previous readiness: ${context.company.readinessNote || 'First review'}

Open objections from prior sessions:
${context.openObjections}

Prior session syntheses:
${context.priorSyntheses}

Company memory:
${context.companyMemoryContext}

Relevant document excerpts:
${context.relevantChunks}

Previous punch list:
${context.previousPunchList}

${query !== 'Full review of this company pitch and readiness' ? `Focus: ${query}` : 'Conduct a full review.'}`;
}
