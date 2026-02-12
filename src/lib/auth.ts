import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

export interface ApiKeyInfo {
  key: string;
  name: string;
  rateLimit?: {
    perKeyPerMinute?: number;
    perKeyPerHour?: number;
  };
}

export interface AuthResult {
  authenticated: boolean;
  keyInfo?: ApiKeyInfo;
  error?: string;
}

let parsedKeys: Map<string, ApiKeyInfo> | null = null;
let lastEnvValue: string | undefined;

/**
 * Parse API_KEYS env var into a Map. Format: "name:key,name:key"
 * Cached per env value (refreshes on change, e.g. after restart).
 */
function getApiKeys(): Map<string, ApiKeyInfo> {
  const envValue = process.env.API_KEYS;

  if (parsedKeys && lastEnvValue === envValue) {
    return parsedKeys;
  }

  parsedKeys = new Map();
  lastEnvValue = envValue;

  if (!envValue) return parsedKeys;

  const entries = envValue.split(',');
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex <= 0) continue;

    const name = trimmed.substring(0, colonIndex).trim();
    const key = trimmed.substring(colonIndex + 1).trim();
    if (name && key) {
      parsedKeys.set(key, { key, name });
    }
  }

  return parsedKeys;
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Extract the API key from a request.
 * Checks Authorization: Bearer <key>, then X-API-Key header.
 */
export function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(\S+)$/i);
    if (match) return match[1];
  }

  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) return xApiKey;

  return null;
}

/**
 * Validate an API key. Async so it can be swapped to a DB lookup later.
 */
export async function validateApiKey(apiKey: string | null): Promise<AuthResult> {
  if (!apiKey) {
    return { authenticated: false, error: 'No API key provided' };
  }

  const keys = getApiKeys();

  if (keys.size === 0) {
    return { authenticated: false, error: 'No API keys configured' };
  }

  // Constant-time comparison against all registered keys
  const entries = Array.from(keys.entries());
  for (const [registeredKey, info] of entries) {
    if (safeCompare(apiKey, registeredKey)) {
      return { authenticated: true, keyInfo: info };
    }
  }

  return { authenticated: false, error: 'Invalid API key' };
}

/** Reset parsed keys cache (for testing) */
export function resetAuthCache(): void {
  parsedKeys = null;
  lastEnvValue = undefined;
}
