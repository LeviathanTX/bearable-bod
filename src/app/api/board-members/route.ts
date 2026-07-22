import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { boardMembers, boardMemberVersions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await withUserContext(session.orgId, 'all', () =>
    db.select().from(boardMembers).where(eq(boardMembers.orgId, session.orgId))
  );

  // Founders see members without personaPrompt/seatContext
  if (session.orgRole === 'founder') {
    const safe = rows.map(({ personaPrompt, seatContext, ...rest }) => rest);
    return NextResponse.json({ boardMembers: safe });
  }

  return NextResponse.json({ boardMembers: rows });
}

export async function POST(req: NextRequest) {
  const session = requireOperator(await resolveSession());
  const body = await req.json();

  const { name, title, committeeRole, expertise, personaPrompt, seatContext, interrogationStyle, avatarEmoji, avatarUrl, model } = body;
  if (!name || !title) {
    return NextResponse.json({ error: 'name and title required' }, { status: 400 });
  }

  const created = await withUserContext(session.orgId, 'all', async () => {
    const rows = await db.insert(boardMembers).values({
      orgId: session.orgId,
      name,
      title,
      committeeRole: committeeRole || null,
      expertise: expertise || [],
      personaPrompt: personaPrompt || null,
      seatContext: seatContext || null,
      interrogationStyle: interrogationStyle || null,
      avatarEmoji: avatarEmoji || null,
      avatarUrl: avatarUrl || null,
      model: model || 'us.anthropic.claude-sonnet-4-6',
    }).returning();

    await db.insert(boardMemberVersions).values({
      boardMemberId: rows[0].id,
      version: 1,
      personaPrompt: personaPrompt || null,
      seatContext: seatContext || null,
      changedBy: session.id,
      changeNote: 'Initial creation',
    });

    return rows[0];
  });

  return NextResponse.json({ boardMember: created }, { status: 201 });
}
