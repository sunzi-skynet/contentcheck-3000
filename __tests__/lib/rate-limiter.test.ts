import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, releaseRequest, resetRateLimits } from '@/lib/rate-limiter';

describe('rate-limiter', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('allows the first request', () => {
    const result = checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(true);
  });

  it('blocks after exceeding per-minute limit', () => {
    const ip = '1.2.3.4';
    for (let i = 0; i < 10; i++) {
      const r = checkRateLimit(ip);
      expect(r.allowed).toBe(true);
      releaseRequest(ip);
    }
    const blocked = checkRateLimit(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('per minute');
  });

  it('blocks when concurrent limit is reached', () => {
    const ip = '5.6.7.8';
    // Use up concurrent slots without releasing
    checkRateLimit(ip);
    checkRateLimit(ip);
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('concurrent');
  });

  it('allows after releasing concurrent slot', () => {
    const ip = '5.6.7.8';
    checkRateLimit(ip);
    checkRateLimit(ip);
    releaseRequest(ip);
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(true);
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('1.1.1.1');
      releaseRequest('1.1.1.1');
    }
    // 1.1.1.1 is maxed out
    expect(checkRateLimit('1.1.1.1').allowed).toBe(false);
    // Different IP should still be allowed
    expect(checkRateLimit('2.2.2.2').allowed).toBe(true);
  });

  it('provides retryAfterSeconds when rate limited', () => {
    const ip = '9.9.9.9';
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip);
      releaseRequest(ip);
    }
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});
