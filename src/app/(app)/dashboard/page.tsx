import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { companies, objections, reviewSessions, refinementProposals } from '@/lib/db/schema';
import { eq, and, desc, ne } from 'drizzle-orm';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await resolveSession();
  if (!session) return null;

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const companyRows = await withUserContext(session.orgId, companyScope, () =>
    db.select().from(companies)
      .where(and(eq(companies.orgId, session.orgId), eq(companies.archived, false)))
  );

  const pendingProposals = session.orgRole === 'operator'
    ? await withUserContext(session.orgId, 'all', () =>
        db.select().from(refinementProposals)
          .where(and(eq(refinementProposals.orgId, session.orgId), eq(refinementProposals.status, 'pending')))
      )
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-semibold text-gray-900">
          {session.orgRole === 'operator' ? 'Operator Dashboard' : 'My Company'}
        </h1>
      </div>

      {pendingProposals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800 font-medium">
            {pendingProposals.length} pending refinement proposal{pendingProposals.length > 1 ? 's' : ''} awaiting review.
          </p>
          <Link href="/proposals" className="text-sm text-amber-700 underline mt-1 inline-block">
            Review proposals
          </Link>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Stage</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Readiness</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companyRows.map((company) => (
              <tr key={company.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/companies/${company.id}`} className="font-medium text-gray-900 hover:text-accent">
                    {company.name}
                  </Link>
                  {company.oneLiner && (
                    <p className="text-sm text-gray-500 mt-0.5">{company.oneLiner}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    {company.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                  {company.readinessNote || '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/companies/${company.id}`}
                    className="text-sm text-[var(--color-accent)] hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {companyRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No companies yet.{' '}
                  {session.orgRole === 'operator' && (
                    <Link href="/companies" className="text-[var(--color-accent)] hover:underline">
                      Add one
                    </Link>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
