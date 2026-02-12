interface ApiRateLimitEntry {
  timestamps: number[];
  concurrent: number;
}

export interface ApiRateLimitConfig {
  perKeyPerMinute: number;
  perKeyPerHour: number;
  globalPerHour: number;
}

const DEFAULT_CONFIG: ApiRateLimitConfig = {
  perKeyPerMinute: 20,
  perKeyPerHour: 500,
  globalPerHour: 5000,
};

const keyEntries = new Map<string, ApiRateLimitEntry>();
const globalTimestamps: number[] = [];

function cleanTimestamps(timestamps: number[], windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

function getOrCreateEntry(key: string): ApiRateLimitEntry {
  let entry = keyEntries.get(key);
  if (!entry) {
    entry = { timestamps: [], concurrent: 0 };
    keyEntries.set(key, entry);
  }
  return entry;
}

export interface ApiRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
  remaining?: number;
}

export function checkApiRateLimit(
  keyName: string,
  config?: Partial<ApiRateLimitConfig>
): ApiRateLimitResult {
  const now = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const entry = getOrCreateEntry(keyName);

  // Clean up timestamps
  cleanTimestamps(entry.timestamps, 3600_000);
  cleanTimestamps(globalTimestamps, 3600_000);

  // Check per-key per-minute
  const minuteAgo = now - 60_000;
  const recentCount = entry.timestamps.filter((t) => t > minuteAgo).length;
  if (recentCount >= cfg.perKeyPerMinute) {
    const oldestInWindow = entry.timestamps.find((t) => t > minuteAgo)!;
    const retryAfter = Math.ceil((oldestInWindow + 60_000 - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: 'Per-key rate limit exceeded (per minute)',
      remaining: 0,
    };
  }

  // Check per-key per-hour
  if (entry.timestamps.length >= cfg.perKeyPerHour) {
    const retryAfter = Math.ceil((entry.timestamps[0] + 3600_000 - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: 'Per-key rate limit exceeded (per hour)',
      remaining: 0,
    };
  }

  // Check global per-hour
  if (globalTimestamps.length >= cfg.globalPerHour) {
    const retryAfter = Math.ceil((globalTimestamps[0] + 3600_000 - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: 'Global API rate limit exceeded',
      remaining: 0,
    };
  }

  // Allowed — record the request
  entry.timestamps.push(now);
  globalTimestamps.push(now);
  entry.concurrent++;

  const remaining = cfg.perKeyPerMinute - recentCount - 1;

  return { allowed: true, remaining };
}

export function releaseApiRequest(keyName: string): void {
  const entry = keyEntries.get(keyName);
  if (entry && entry.concurrent > 0) {
    entry.concurrent--;
  }
}

/** Reset all API rate limit state (for testing) */
export function resetApiRateLimits(): void {
  keyEntries.clear();
  globalTimestamps.length = 0;
}
