import { resolveSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function CompaniesPage() {
  const session = await resolveSession();
  if (!session) redirect('/auth');

  if (session.orgRole === 'founder' && session.companyId) {
    redirect(`/companies/${session.companyId}`);
  }

  return redirect('/dashboard');
}
