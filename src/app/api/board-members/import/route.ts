import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { boardMembers, boardMemberVersions } from '@/lib/db/schema';

interface ImportItem {
  name: string;
  title: string;
  committeeRole?: string;
  expertise?: string[];
  personaPrompt?: string;
  seatContext?: string;
  interrogationStyle?: string;
  avatarEmoji?: string;
  model?: string;
}

export async function POST(req: NextRequest) {
  const session = requireOperator(await resolveSession());
  const body = await req.json();

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON array of board members' }, { status: 400 });
  }

  const items = body as ImportItem[];
  const errors: string[] = [];
  const created: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.name || !item.title) {
      errors.push(`Item ${i}: name and title required`);
      continue;
    }

    await withUserContext(session.orgId, 'all', async () => {
      const rows = await db.insert(boardMembers).values({
        orgId: session.orgId,
        name: item.name,
        title: item.title,
        committeeRole: item.committeeRole || null,
        expertise: item.expertise || [],
        personaPrompt: item.personaPrompt || null,
        seatContext: item.seatContext || null,
        interrogationStyle: item.interrogationStyle || null,
        avatarEmoji: item.avatarEmoji || null,
        model: item.model || 'us.anthropic.claude-sonnet-4-6',
      }).returning();

      await db.insert(boardMemberVersions).values({
        boardMemberId: rows[0].id,
        version: 1,
        personaPrompt: item.personaPrompt || null,
        seatContext: item.seatContext || null,
        changedBy: session.id,
        changeNote: 'Bulk import',
      });

      created.push(rows[0].id);
    });
  }

  return NextResponse.json({ created: created.length, errors }, { status: 201 });
}
