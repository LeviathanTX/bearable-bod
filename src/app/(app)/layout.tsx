import { resolveSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveSession();
  if (!session) redirect('/auth');

  return <AppShell session={session}>{children}</AppShell>;
}
