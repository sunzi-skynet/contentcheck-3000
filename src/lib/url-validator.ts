import { promises as dns } from 'dns';

function isPrivateIPv4(ip: string): boolean {
  if (ip.startsWith('127.')) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('0.')) return true;
  if (ip.startsWith('169.254.')) return true;
  if (ip.startsWith('192.168.')) return true;

  // 172.16.0.0/12 — 172.16.x.x through 172.31.x.x
  if (ip.startsWith('172.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // 100.64.0.0/10 (CGNAT)
  if (ip.startsWith('100.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10);
    if (secondOctet >= 64 && secondOctet <= 127) return true;
  }

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // fc00::/7 — unique local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // fe80::/10 — link-local
  if (normalized.startsWith('fe80')) return true;
  // IPv4-mapped IPv6 ::ffff:x.x.x.x
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (v4Part.includes('.')) {
      return isPrivateIPv4(v4Part);
    }
  }
  return false;
}

export function isPrivateIP(ip: string): boolean {
  if (ip.includes(':')) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

/**
 * Validates a URL for safe server-side fetching.
 * Returns the validated URL string or throws an error.
 */
export async function validateUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked scheme: ${parsed.protocol} — only http and https are allowed`);
  }

  // Block IP-literal hostnames with obfuscation (decimal, hex, octal)
  const hostname = parsed.hostname;

  // Reject empty hostname
  if (!hostname) {
    throw new Error('URL has no hostname');
  }

  // Resolve DNS
  let addresses: string[];
  try {
    const result = await dns.lookup(hostname, { all: true });
    addresses = result.map((r) => r.address);
  } catch {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new Error(`DNS resolution returned no addresses for ${hostname}`);
  }

  // Check all resolved IPs
  for (const ip of addresses) {
    if (isPrivateIP(ip)) {
      throw new Error(`Blocked: ${hostname} resolves to private/reserved IP ${ip}`);
    }
  }

  return parsed.toString();
}

const SAFE_SELECTOR_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$|^#[a-zA-Z][a-zA-Z0-9_-]*$|^\.[a-zA-Z][a-zA-Z0-9_-]*$|^[a-zA-Z][a-zA-Z0-9-]*\s+[a-zA-Z][a-zA-Z0-9-]*$|^[a-zA-Z][a-zA-Z0-9-]*\s*>\s*[a-zA-Z][a-zA-Z0-9-]*$/;

/**
 * Validates a CSS selector against a safe-pattern allowlist.
 * Only allows: tag names, class selectors, ID selectors, and simple combinators.
 */
export function validateSelector(selector: string): boolean {
  const trimmed = selector.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return false;

  // Split by comma for grouped selectors
  const parts = trimmed.split(',').map((p) => p.trim());
  return parts.every((part) => SAFE_SELECTOR_PATTERN.test(part));
}
