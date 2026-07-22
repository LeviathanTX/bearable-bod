import { cookies } from 'next/headers';
import { db, sql } from '@/lib/db/client';
import { authSessions, users, orgMembers } from '@/lib/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import crypto from 'crypto';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'preboard_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  orgId: string;
  orgRole: 'operator' | 'founder';
  companyId: string | null;
}

export async function resolveSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      userId: authSessions.userId,
      email: users.email,
      fullName: users.fullName,
      orgId: orgMembers.orgId,
      orgRole: orgMembers.role,
      companyId: orgMembers.companyId,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .innerJoin(orgMembers, and(
      eq(orgMembers.userId, authSessions.userId),
      eq(orgMembers.status, 'active'),
    ))
    .where(and(
      eq(authSessions.tokenHash, tokenHash),
      gt(authSessions.expiresAt, new Date()),
    ))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.userId,
    email: row.email,
    fullName: row.fullName,
    orgId: row.orgId,
    orgRole: row.orgRole as 'operator' | 'founder',
    companyId: row.companyId,
  };
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(authSessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return token;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export function requireOperator(session: SessionUser | null): SessionUser {
  if (!session) throw new Error('Unauthorized');
  if (session.orgRole !== 'operator') throw new Error('Forbidden: operator only');
  return session;
}
