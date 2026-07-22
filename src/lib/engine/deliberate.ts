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

export async function runDeliberation(
  orgId: string,
  sessionId: string,
  dailyCap: number,
): Promise<void> {
  let session: any;
  let seats: BoardMemberRow[] = [];
  let companyId: string;

  await withUserContext(orgId, 'all', async () => {
    const rows = await db.select().from(reviewSessions).where(eq(reviewSessions.id, sessionId)).limit(1);
    session = rows[0];
    if (!session) throw new Error('Session not found');
    companyId = session.companyId;

    const seatIds = (session.seatIds as string[]) || [];
    if (seatIds.length === 0) throw new Error('No seats selected');
    if (seatIds.length > 6) throw new Error('Maximum 6 seats per session');

    seats = await db.select().from(boardMembers)
      .where(and(eq(boardMembers.orgId, orgId), inArray(boardMembers.id, seatIds)));
  });

  companyId = session.companyId;

  const query = session.focusPrompt || 'Full review of this company pitch and readiness';
  const context = await buildReviewContext(orgId, companyId, query);

  // Phase 1: Interrogate (parallel)
  const capOk = await checkAiCallCap(orgId, dailyCap);
  if (!capOk) throw new Error('Daily AI call cap reached');

  const interrogationResults = await Promise.all(
    seats.map((seat) => runInterrogation(orgId, sessionId, seat, context, query))
  );

  await withUserContext(orgId, companyId, async () => {
    await db.update(reviewSessions).set({ phase: 'advise' }).where(eq(reviewSessions.id, sessionId));
  });

  // Phase 2: Extract objections
  const allObjections = await extractObjections(orgId, companyId, sessionId, interrogationResults, seats);

  // Phase 3: Advise (parallel)
  const adviseResults = await Promise.all(
    seats.map((seat) => {
      const myTake = interrogationResults.find((r) => r.boardMemberId === seat.id);
      return runAdvise(orgId, sessionId, seat, context, allObjections, myTake?.content || '');
    })
  );

  // Phase 4: Chair synthesis
  const synthesis = await runChairSynthesis(orgId, sessionId, companyId, context, interrogationResults, adviseResults, allObjections);

  // Store progress note
  await storeMemory(
    orgId,
    companyId,
    'progress_note',
    `Session completed. ${allObjections.length} objections raised/updated. Chair summary: ${synthesis.slice(0, 300)}`,
    'session',
    0.7,
  );
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
    model: seat.model || undefined,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 2048,
    temperature: 0.7,
  });

  await withUserContext(orgId, context.company.name ? 'all' : 'all', async () => {
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
    model: seat.model || undefined,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 2048,
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
    systemPrompt: `Extract objections from board interrogations. Return a JSON array. Each item: { "title": "short title", "detail": "explanation", "severity": "deal_killer"|"major"|"minor", "lens": "the committee role raising it", "boardMemberId": "the seat ID" }. Only include genuine objections, not positive feedback.`,
    userMessage: `Seats and their IDs:\n${seats.map((s) => `${s.id}: ${s.name} (${s.committeeRole})`).join('\n')}\n\nInterrogation transcripts:\n${combined}`,
  });

  // Dedupe against existing objections (semantic similarity > 0.85 = re-raise)
  const existingObjections = await withUserContext(orgId, companyId, () =>
    db.select().from(objections)
      .where(and(eq(objections.companyId, companyId)))
  );

  for (const obj of extracted) {
    let isDuplicate = false;

    if (existingObjections.length > 0) {
      try {
        const objEmbedding = await embedText(obj.title + ' ' + obj.detail);
        for (const existing of existingObjections) {
          if (existing.state === 'resolved') continue;
          // Simple keyword overlap check as fallback
          const titleOverlap = obj.title.toLowerCase().includes(existing.title.toLowerCase().split(' ')[0]);
          if (titleOverlap) {
            // Update state history: re-raised
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
    systemPrompt,
    messages: [{
      role: 'user',
      content: `Company: ${context.company.name}\nStage: ${context.company.stage}\n\nInterrogation phase:\n${interrogationText}\n\nAdvise phase:\n${adviseText}\n\nCurrent objections:\n${context.openObjections}`,
    }],
    maxTokens: 3000,
    temperature: 0.5,
  });

  // Extract punch list from synthesis
  const punchListMatch = result.content.match(/## Punch List\n([\s\S]*?)(?=\n## |$)/);
  const punchItems = punchListMatch ? punchListMatch[1].trim().split('\n').filter(Boolean) : [];

  // Extract readiness note
  const readinessMatch = result.content.match(/## Readiness Note\n([\s\S]*?)(?=\n## |$)/);
  const readinessNote = readinessMatch ? readinessMatch[1].trim() : null;

  // Persist
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
    return `${persona}${context}${style}\n\nYou are on a buying committee. Interrogate this pitch the way you would in committee. Raise your objections explicitly, each with a severity (deal_killer, major, or minor). Be specific about what concerns you and why. Do not be sycophantic.`;
  }

  return `${persona}${context}${style}\n\nYou just interrogated this pitch. Now advise the founder: what specifically fixes your objections? Be constructive but honest.`;
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
