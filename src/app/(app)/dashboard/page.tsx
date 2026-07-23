import { resolveSession } from '@/lib/auth/session';
import { db, withUserContext } from '@/lib/db/client';
import { companies, boardMembers, reviewSessions, refinementProposals } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import Link from 'next/link';

export default async function DashboardPage() {
  const session = await resolveSession();
  if (!session) return null;

  const companyScope = session.orgRole === 'founder' ? session.companyId! : 'all';

  const [companyRows, memberRows, recentSessions, pendingProposals] = await Promise.all([
    withUserContext(session.orgId, companyScope, () =>
      db.select().from(companies)
        .where(and(eq(companies.orgId, session.orgId), eq(companies.archived, false)))
    ),
    withUserContext(session.orgId, 'all', () =>
      db.select().from(boardMembers)
        .where(and(eq(boardMembers.orgId, session.orgId), eq(boardMembers.active, true)))
    ),
    withUserContext(session.orgId, companyScope, () =>
      db.select().from(reviewSessions)
        .where(eq(reviewSessions.orgId, session.orgId))
        .orderBy(desc(reviewSessions.createdAt))
        .limit(5)
    ),
    session.orgRole === 'operator'
      ? withUserContext(session.orgId, 'all', () =>
          db.select().from(refinementProposals)
            .where(and(eq(refinementProposals.orgId, session.orgId), eq(refinementProposals.status, 'pending')))
        )
      : Promise.resolve([]),
  ]);

  const hasBoard = memberRows.length > 0;
  const hasCompanies = companyRows.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-semibold text-gray-900">
          {session.orgRole === 'operator' ? 'Dashboard' : 'My Company'}
        </h1>
      </div>

      {/* Getting started guide for empty orgs */}
      {session.orgRole === 'operator' && !hasBoard && (
        <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-2">Welcome to Bearable BoD</h2>
          <p className="text-sm text-gray-600 mb-4">
            Get started by assembling your advisory board from our template library, then add a company to review.
          </p>
          <div className="flex gap-3">
            <Link
              href="/board-members"
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500"
            >
              Add Advisors from Library
            </Link>
            {hasCompanies && (
              <Link
                href={`/companies/${companyRows[0].id}`}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                View Company
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stats row */}
      {(hasBoard || hasCompanies) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Board Members" value={memberRows.length} href="/board-members" />
          <StatCard label="Companies" value={companyRows.length} href="/companies" />
          <StatCard label="Sessions Run" value={recentSessions.length} />
          <StatCard label="Pending Proposals" value={pendingProposals.length} href="/proposals" highlight={pendingProposals.length > 0} />
        </div>
      )}

      {/* Pending proposals alert */}
      {pendingProposals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800 font-medium">
            {pendingProposals.length} refinement proposal{pendingProposals.length > 1 ? 's' : ''} awaiting review.
          </p>
          <Link href="/proposals" className="text-sm text-amber-700 underline mt-1 inline-block">
            Review proposals
          </Link>
        </div>
      )}

      {/* Companies table */}
      {hasCompanies && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">Companies</h2>
            {session.orgRole === 'operator' && (
              <Link href="/companies" className="text-xs text-emerald-600 hover:underline">
                Manage
              </Link>
            )}
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Stage</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Readiness</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companyRows.map((company) => (
                <tr key={company.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${company.id}`} className="font-medium text-gray-900 hover:text-emerald-600">
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
                      className="text-sm text-emerald-600 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-2">Recent Sessions</h2>
          <div className="space-y-2">
            {recentSessions.slice(0, 3).map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                <span className={`w-2 h-2 rounded-full ${s.status === 'complete' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                <span className="text-sm text-gray-700 capitalize">{s.mode.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-400 ml-auto">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, href, highlight }: { label: string; value: number; href?: string; highlight?: boolean }) {
  const content = (
    <div className={`bg-white border rounded-lg p-4 ${highlight ? 'border-amber-300' : 'border-gray-200'}`}>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}
