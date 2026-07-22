import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

export async function checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
  const r = getRedis();
  if (!r) return true; // graceful degradation

  const fullKey = `pb:rl:${key}`;
  const current = await r.incr(fullKey);
  if (current === 1) {
    await r.expire(fullKey, windowSeconds);
  }
  return current <= maxRequests;
}

export async function checkAiCallCap(orgId: string, dailyCap: number): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;

  const date = new Date().toISOString().slice(0, 10);
  const key = `pb:calls:${orgId}:${date}`;
  const current = await r.incr(key);
  if (current === 1) {
    await r.expire(key, 86400);
  }
  return current <= dailyCap;
}

export async function getAiCallCount(orgId: string): Promise<number> {
  const r = getRedis();
  if (!r) return 0;

  const date = new Date().toISOString().slice(0, 10);
  const key = `pb:calls:${orgId}:${date}`;
  const val = await r.get<number>(key);
  return val || 0;
}
