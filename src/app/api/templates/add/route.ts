import { NextRequest, NextResponse } from 'next/server';
import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { boardMemberTemplates, boardMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const session = await resolveSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.orgRole !== 'operator') {
    return NextResponse.json({ error: 'Only operators can add templates' }, { status: 403 });
  }

  const { templateId } = await req.json();
  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 });
  }

  const templates = await db.select().from(boardMemberTemplates).where(eq(boardMemberTemplates.id, templateId)).limit(1);
  if (templates.length === 0) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const t = templates[0];

  const boardMember = await withUserContext(session.orgId, 'all', () =>
    db.insert(boardMembers).values({
      orgId: session.orgId,
      name: t.name,
      title: t.title,
      committeeRole: t.committeeRole,
      expertise: t.expertise,
      personaPrompt: t.personaPrompt,
      seatContext: t.seatContext ? `${t.seatContext}\n\n[Added from template: ${t.templateSet}]` : `[Added from template: ${t.templateSet}]`,
      interrogationStyle: t.interrogationStyle,
      avatarEmoji: t.avatarEmoji,
    }).returning()
  );

  return NextResponse.json({ boardMember: boardMember[0] }, { status: 201 });
}
