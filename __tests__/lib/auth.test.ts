import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractApiKey, validateApiKey, resetAuthCache } from '@/lib/auth';
import { NextRequest } from 'next/server';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/compare', {
    method: 'POST',
    headers,
  });
}

describe('auth', () => {
  beforeEach(() => {
    resetAuthCache();
  });

  afterEach(() => {
    delete process.env.API_KEYS;
    resetAuthCache();
  });

  describe('extractApiKey', () => {
    it('extracts key from Authorization: Bearer header', () => {
      const req = makeRequest({ Authorization: 'Bearer sk_live_abc123' });
      expect(extractApiKey(req)).toBe('sk_live_abc123');
    });

    it('extracts key from X-API-Key header', () => {
      const req = makeRequest({ 'X-API-Key': 'sk_live_abc123' });
      expect(extractApiKey(req)).toBe('sk_live_abc123');
    });

    it('prefers Authorization header over X-API-Key', () => {
      const req = makeRequest({
        Authorization: 'Bearer sk_live_from_auth',
        'X-API-Key': 'sk_live_from_xapi',
      });
      expect(extractApiKey(req)).toBe('sk_live_from_auth');
    });

    it('returns null when no key header is present', () => {
      const req = makeRequest({});
      expect(extractApiKey(req)).toBeNull();
    });

    it('returns null for non-Bearer Authorization', () => {
      const req = makeRequest({ Authorization: 'Basic dXNlcjpwYXNz' });
      expect(extractApiKey(req)).toBeNull();
    });

    it('handles case-insensitive Bearer prefix', () => {
      const req = makeRequest({ Authorization: 'bearer sk_live_abc123' });
      expect(extractApiKey(req)).toBe('sk_live_abc123');
    });
  });

  describe('validateApiKey', () => {
    it('returns authenticated false when no key provided', async () => {
      process.env.API_KEYS = 'test:sk_live_abc123';
      const result = await validateApiKey(null);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('No API key provided');
    });

    it('returns authenticated false when no keys configured', async () => {
      delete process.env.API_KEYS;
      const result = await validateApiKey('sk_live_abc123');
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('No API keys configured');
    });

    it('authenticates a valid key', async () => {
      process.env.API_KEYS = 'acme:sk_live_abc123';
      const result = await validateApiKey('sk_live_abc123');
      expect(result.authenticated).toBe(true);
      expect(result.keyInfo?.name).toBe('acme');
      expect(result.keyInfo?.key).toBe('sk_live_abc123');
    });

    it('rejects an invalid key', async () => {
      process.env.API_KEYS = 'acme:sk_live_abc123';
      const result = await validateApiKey('sk_live_wrong');
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('handles multiple keys', async () => {
      process.env.API_KEYS = 'acme:sk_live_aaa,partner:sk_live_bbb';
      const result1 = await validateApiKey('sk_live_aaa');
      expect(result1.authenticated).toBe(true);
      expect(result1.keyInfo?.name).toBe('acme');

      const result2 = await validateApiKey('sk_live_bbb');
      expect(result2.authenticated).toBe(true);
      expect(result2.keyInfo?.name).toBe('partner');
    });

    it('handles whitespace in env var', async () => {
      process.env.API_KEYS = ' acme : sk_live_abc123 , partner : sk_live_def456 ';
      const result = await validateApiKey('sk_live_abc123');
      expect(result.authenticated).toBe(true);
      expect(result.keyInfo?.name).toBe('acme');
    });

    it('skips malformed entries', async () => {
      process.env.API_KEYS = 'bad_entry,acme:sk_live_abc123,:emptyname,novalue:';
      const result = await validateApiKey('sk_live_abc123');
      expect(result.authenticated).toBe(true);
      expect(result.keyInfo?.name).toBe('acme');
    });

    it('handles empty API_KEYS env var', async () => {
      process.env.API_KEYS = '';
      const result = await validateApiKey('sk_live_abc123');
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('No API keys configured');
    });

    it('handles keys with colons in the value', async () => {
      process.env.API_KEYS = 'acme:sk_live_abc:123:456';
      const result = await validateApiKey('sk_live_abc:123:456');
      expect(result.authenticated).toBe(true);
      expect(result.keyInfo?.name).toBe('acme');
    });
  });
});
