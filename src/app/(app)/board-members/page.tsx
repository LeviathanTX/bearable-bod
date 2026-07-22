import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { boardMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { BoardMemberStudio } from '@/components/BoardMemberStudio';

export default async function BoardMembersPage() {
  const session = requireOperator(await resolveSession());

  const members = await withUserContext(session.orgId, 'all', () =>
    db.select().from(boardMembers).where(eq(boardMembers.orgId, session.orgId))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold text-gray-900">Board Members</h1>
      </div>
      <BoardMemberStudio initialMembers={members} />
    </div>
  );
}
