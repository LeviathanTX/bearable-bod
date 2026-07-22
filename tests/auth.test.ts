import { describe, it, expect } from 'vitest';
import { hashToken, generateToken } from '@/lib/auth/session';
import crypto from 'crypto';

describe('auth token hashing', () => {
  it('generates 64-char hex tokens (256 bits)', () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it('hashes tokens with SHA-256', () => {
    const token = 'test-token-12345';
    const hash = hashToken(token);
    const expected = crypto.createHash('sha256').update(token).digest('hex');
    expect(hash).toBe(expected);
    expect(hash).toHaveLength(64);
  });

  it('produces different hashes for different tokens', () => {
    const hash1 = hashToken('token-a');
    const hash2 = hashToken('token-b');
    expect(hash1).not.toBe(hash2);
  });

  it('produces consistent hashes for same token', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });
});
