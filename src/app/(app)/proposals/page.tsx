import { resolveSession, requireOperator } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { refinementProposals, boardMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ProposalInbox } from '@/components/ProposalInbox';

export default async function ProposalsPage() {
  const session = requireOperator(await resolveSession());

  const proposals = await withUserContext(session.orgId, 'all', () =>
    db.select().from(refinementProposals).where(eq(refinementProposals.orgId, session.orgId))
  );

  const members = await withUserContext(session.orgId, 'all', () =>
    db.select().from(boardMembers).where(eq(boardMembers.orgId, session.orgId))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-semibold text-gray-900">Refinement Proposals</h1>
      <ProposalInbox proposals={proposals} boardMembers={members} />
    </div>
  );
}
