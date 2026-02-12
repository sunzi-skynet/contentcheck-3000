interface RateLimitEntry {
  timestamps: number[];
  concurrent: number;
}

interface RateLimitConfig {
  perIpPerMinute: number;
  perIpPerHour: number;
  globalPerHour: number;
  maxConcurrentPerIp: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  perIpPerMinute: 10,
  perIpPerHour: 100,
  globalPerHour: 1000,
  maxConcurrentPerIp: 2,
};

const ipEntries = new Map<string, RateLimitEntry>();
const globalTimestamps: number[] = [];

function cleanTimestamps(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  // Remove old timestamps in-place
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
  return timestamps;
}

function getOrCreateEntry(ip: string): RateLimitEntry {
  let entry = ipEntries.get(ip);
  if (!entry) {
    entry = { timestamps: [], concurrent: 0 };
    ipEntries.set(ip, entry);
  }
  return entry;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  reason?: string;
}

export function checkRateLimit(
  ip: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  const now = Date.now();
  const entry = getOrCreateEntry(ip);

  // Clean up timestamps
  cleanTimestamps(entry.timestamps, 3600_000); // 1 hour window
  cleanTimestamps(globalTimestamps, 3600_000);

  // Check concurrent limit
  if (entry.concurrent >= config.maxConcurrentPerIp) {
    return {
      allowed: false,
      retryAfterSeconds: 5,
      reason: 'Too many concurrent requests',
    };
  }

  // Check per-IP per-minute
  const minuteAgo = now - 60_000;
  const recentCount = entry.timestamps.filter((t) => t > minuteAgo).length;
  if (recentCount >= config.perIpPerMinute) {
    const oldestInWindow = entry.timestamps.find((t) => t > minuteAgo)!;
    const retryAfter = Math.ceil((oldestInWindow + 60_000 - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: 'Per-IP rate limit exceeded (per minute)',
    };
  }

  // Check per-IP per-hour
  if (entry.timestamps.length >= config.perIpPerHour) {
    const retryAfter = Math.ceil((entry.timestamps[0] + 3600_000 - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: 'Per-IP rate limit exceeded (per hour)',
    };
  }

  // Check global per-hour
  if (globalTimestamps.length >= config.globalPerHour) {
    const retryAfter = Math.ceil((globalTimestamps[0] + 3600_000 - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      reason: 'Global rate limit exceeded',
    };
  }

  // Allowed — record the request
  entry.timestamps.push(now);
  globalTimestamps.push(now);
  entry.concurrent++;

  return { allowed: true };
}

export function releaseRequest(ip: string): void {
  const entry = ipEntries.get(ip);
  if (entry && entry.concurrent > 0) {
    entry.concurrent--;
  }
}

/** Reset all rate limit state (for testing) */
export function resetRateLimits(): void {
  ipEntries.clear();
  globalTimestamps.length = 0;
}
