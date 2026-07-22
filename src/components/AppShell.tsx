'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SessionUser } from '@/lib/auth/session';

interface Props {
  session: SessionUser;
  children: React.ReactNode;
}

export function AppShell({ session, children }: Props) {
  const pathname = usePathname();

  const nav = session.orgRole === 'operator'
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/companies', label: 'Companies' },
        { href: '/board-members', label: 'Board' },
        { href: '/proposals', label: 'Proposals' },
      ]
    : [
        { href: '/dashboard', label: 'My Company' },
      ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-8">
            <span className="font-display font-semibold text-lg text-gray-900">PreBoard</span>
            <nav className="flex gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    pathname.startsWith(item.href)
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{session.email}</span>
            <form action="/api/auth/signout" method="POST">
              <button className="text-sm text-gray-400 hover:text-gray-600">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
