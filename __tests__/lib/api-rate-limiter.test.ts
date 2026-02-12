import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkApiRateLimit,
  releaseApiRequest,
  resetApiRateLimits,
} from '@/lib/api-rate-limiter';

describe('api-rate-limiter', () => {
  beforeEach(() => {
    resetApiRateLimits();
  });

  it('allows the first request', () => {
    const result = checkApiRateLimit('acme');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('tracks remaining requests', () => {
    const config = { perKeyPerMinute: 3, perKeyPerHour: 100, globalPerHour: 1000 };
    const r1 = checkApiRateLimit('acme', config);
    expect(r1.remaining).toBe(2);
    const r2 = checkApiRateLimit('acme', config);
    expect(r2.remaining).toBe(1);
    const r3 = checkApiRateLimit('acme', config);
    expect(r3.remaining).toBe(0);
  });

  it('blocks after exceeding per-minute limit', () => {
    const config = { perKeyPerMinute: 2, perKeyPerHour: 100, globalPerHour: 1000 };
    checkApiRateLimit('acme', config);
    checkApiRateLimit('acme', config);
    const result = checkApiRateLimit('acme', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per minute');
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('blocks after exceeding per-hour limit', () => {
    const config = { perKeyPerMinute: 1000, perKeyPerHour: 3, globalPerHour: 10000 };
    checkApiRateLimit('acme', config);
    checkApiRateLimit('acme', config);
    checkApiRateLimit('acme', config);
    const result = checkApiRateLimit('acme', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('per hour');
  });

  it('blocks after exceeding global limit', () => {
    const config = { perKeyPerMinute: 1000, perKeyPerHour: 10000, globalPerHour: 2 };
    checkApiRateLimit('acme', config);
    checkApiRateLimit('partner', config);
    const result = checkApiRateLimit('other', config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Global');
  });

  it('tracks different keys independently', () => {
    const config = { perKeyPerMinute: 1, perKeyPerHour: 100, globalPerHour: 1000 };
    checkApiRateLimit('acme', config);
    const acmeResult = checkApiRateLimit('acme', config);
    expect(acmeResult.allowed).toBe(false);

    // Different key should still be allowed
    const partnerResult = checkApiRateLimit('partner', config);
    expect(partnerResult.allowed).toBe(true);
  });

  it('releaseApiRequest decrements concurrent count', () => {
    checkApiRateLimit('acme');
    releaseApiRequest('acme');
    // Should not throw or cause issues
    releaseApiRequest('acme'); // Already at 0
    releaseApiRequest('nonexistent'); // No entry
  });

  it('resetApiRateLimits clears all state', () => {
    const config = { perKeyPerMinute: 1, perKeyPerHour: 100, globalPerHour: 1000 };
    checkApiRateLimit('acme', config);
    const blocked = checkApiRateLimit('acme', config);
    expect(blocked.allowed).toBe(false);

    resetApiRateLimits();
    const afterReset = checkApiRateLimit('acme', config);
    expect(afterReset.allowed).toBe(true);
  });
});
