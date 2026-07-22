import { resolveSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { db, withUserContext } from '@/lib/db/client';
import { companies } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import Link from 'next/link';

export default async function CompaniesPage() {
  const session = await resolveSession();
  if (!session) redirect('/auth');

  if (session.orgRole === 'founder' && session.companyId) {
    redirect(`/companies/${session.companyId}`);
  }

  const companyRows = await withUserContext(session.orgId, 'all', () =>
    db.select().from(companies)
      .where(and(eq(companies.orgId, session.orgId), eq(companies.archived, false)))
  );

  if (companyRows.length === 1) {
    redirect(`/companies/${companyRows[0].id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-semibold text-gray-900">Companies</h1>
      </div>
      {companyRows.length === 0 ? (
        <p className="text-gray-500">No companies yet. Add one from the dashboard.</p>
      ) : (
        <div className="grid gap-4">
          {companyRows.map((company) => (
            <Link
              key={company.id}
              href={`/companies/${company.id}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-emerald-300 transition-colors"
            >
              <h2 className="font-medium text-gray-900">{company.name}</h2>
              {company.oneLiner && <p className="text-sm text-gray-500 mt-1">{company.oneLiner}</p>}
              <span className="inline-flex mt-2 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                {company.stage}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
