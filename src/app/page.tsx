import { redirect } from 'next/navigation';
import { resolveSession } from '@/lib/auth/session';

export default async function Home() {
  const session = await resolveSession();
  if (session) {
    redirect('/dashboard');
  } else {
    redirect('/auth');
  }
}
