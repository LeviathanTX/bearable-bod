import { db } from '@/lib/db/client';
import { magicTokens, users, orgs, orgMembers } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { generateToken, hashToken, createSession } from './session';
import { sendEmail } from '@/lib/email/ses';

const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000;
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'https://preboard-three.vercel.app';
}

export async function sendMagicLink(email: string): Promise<void> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

  await db.insert(magicTokens).values({
    email: email.toLowerCase().trim(),
    tokenHash,
    purpose: 'login',
    expiresAt,
  });

  const url = `${getBaseUrl()}/api/auth/magic?token=${token}`;

  await sendEmail({
    to: email,
    subject: 'Sign in to PreBoard',
    html: `<p>Click the link below to sign in:</p><p><a href="${url}">Sign in to PreBoard</a></p><p>This link expires in 15 minutes.</p>`,
  });
}

export async function sendFounderInvite(
  email: string,
  orgId: string,
  companyId: string,
  orgName: string,
): Promise<void> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  await db.insert(magicTokens).values({
    email: email.toLowerCase().trim(),
    tokenHash,
    purpose: 'founder_invite',
    orgId,
    companyId,
    expiresAt,
  });

  const url = `${getBaseUrl()}/api/invites/accept?token=${token}`;

  await sendEmail({
    to: email,
    subject: `You've been invited to ${orgName}`,
    html: `<p>You've been invited to join ${orgName} on PreBoard.</p><p><a href="${url}">Accept invitation</a></p><p>This link expires in 7 days.</p>`,
  });
}

export async function redeemMagicToken(rawToken: string): Promise<{ sessionToken: string; isNewUser: boolean } | null> {
  const tokenHash = hashToken(rawToken);

  const rows = await db
    .select()
    .from(magicTokens)
    .where(and(
      eq(magicTokens.tokenHash, tokenHash),
      isNull(magicTokens.usedAt),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  const magicRow = rows[0];

  if (new Date() > magicRow.expiresAt) return null;

  // Mark as used
  await db.update(magicTokens).set({ usedAt: new Date() }).where(eq(magicTokens.id, magicRow.id));

  const email = magicRow.email.toLowerCase().trim();

  // Find or create user
  let userRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let isNewUser = false;

  if (userRows.length === 0) {
    const inserted = await db.insert(users).values({ email }).returning();
    userRows = inserted;
    isNewUser = true;
  }

  const user = userRows[0];

  // Handle invite: create org membership
  if (magicRow.purpose === 'founder_invite' && magicRow.orgId && magicRow.companyId) {
    const existing = await db.select().from(orgMembers)
      .where(and(eq(orgMembers.userId, user.id), eq(orgMembers.orgId, magicRow.orgId)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(orgMembers).values({
        orgId: magicRow.orgId,
        userId: user.id,
        role: 'founder',
        companyId: magicRow.companyId,
      });
    }
  }

  // Handle login: if user has no org yet, create one (operator bootstrap)
  if (magicRow.purpose === 'login') {
    const memberRows = await db.select().from(orgMembers).where(eq(orgMembers.userId, user.id)).limit(1);
    if (memberRows.length === 0) {
      const slug = email.split('@')[0].replace(/[^a-z0-9]/g, '-').slice(0, 30);
      const newOrg = await db.insert(orgs).values({
        name: `${email.split('@')[0]}'s Org`,
        slug: `${slug}-${Date.now().toString(36)}`,
      }).returning();
      await db.insert(orgMembers).values({
        orgId: newOrg[0].id,
        userId: user.id,
        role: 'operator',
      });
    }
  }

  const sessionToken = await createSession(user.id);
  return { sessionToken, isNewUser };
}
