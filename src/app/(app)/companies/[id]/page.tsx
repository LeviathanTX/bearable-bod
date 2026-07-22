import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { companies, objections, reviewSessions, documents, boardMembers } from '@/lib/db/schema';
import { eq, and, ne, desc } from 'drizzle-orm';
import { CompanyRoom } from '@/components/CompanyRoom';

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await resolveSession();
  if (!session) return null;
  const { id } = await params;

  if (session.orgRole === 'founder' && session.companyId !== id) {
    return <div className="text-red-600">Access denied</div>;
  }

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const [companyRows, objectionRows, sessionRows, docRows, memberRows] = await Promise.all([
    withUserContext(session.orgId, companyScope, () =>
      db.select().from(companies).where(eq(companies.id, id)).limit(1)
    ),
    withUserContext(session.orgId, companyScope, () =>
      db.select().from(objections).where(eq(objections.companyId, id)).orderBy(desc(objections.createdAt))
    ),
    withUserContext(session.orgId, companyScope, () =>
      db.select().from(reviewSessions).where(eq(reviewSessions.companyId, id)).orderBy(desc(reviewSessions.createdAt))
    ),
    withUserContext(session.orgId, companyScope, () =>
      db.select().from(documents).where(eq(documents.companyId, id)).orderBy(desc(documents.createdAt))
    ),
    withUserContext(session.orgId, 'all', () =>
      db.select().from(boardMembers).where(and(eq(boardMembers.orgId, session.orgId), eq(boardMembers.active, true)))
    ),
  ]);

  if (companyRows.length === 0) return <div>Company not found</div>;

  return (
    <CompanyRoom
      company={companyRows[0]}
      objections={objectionRows}
      sessions={sessionRows}
      documents={docRows}
      boardMembers={memberRows}
      isOperator={session.orgRole === 'operator'}
    />
  );
}
