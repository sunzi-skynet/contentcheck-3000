import { validateUrl } from './url-validator';
import type { AuthCredentials } from './types';

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'ContentCheck3000/1.0';

function getTimeoutMs(): number {
  const envVal = process.env.FETCH_TIMEOUT_MS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return lower.includes('text/html') || lower.includes('application/xhtml+xml');
}

function detectCharsetFromHeader(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = contentType.match(/charset=([^\s;]+)/i);
  return match ? match[1].replace(/["']/g, '') : null;
}

function detectCharsetFromMeta(bytes: Uint8Array): string | null {
  // Decode first 1024 bytes as latin-1 (byte-transparent) to sniff meta tags
  const snippet = new TextDecoder('latin1').decode(bytes.slice(0, 1024));

  // <meta charset="...">
  const charsetMatch = snippet.match(/<meta\s+charset=["']?([^"'\s>]+)/i);
  if (charsetMatch) return charsetMatch[1];

  // <meta http-equiv="Content-Type" content="...;charset=...">
  const httpEquivMatch = snippet.match(
    /<meta\s+http-equiv=["']?Content-Type["']?\s+content=["'][^"']*charset=([^"'\s;]+)/i
  );
  if (httpEquivMatch) return httpEquivMatch[1];

  return null;
}

/**
 * Fetches HTML from a URL with SSRF protection, size limits, timeout, and encoding detection.
 * Returns the HTML as a UTF-8 string.
 */
export async function fetchPage(url: string, auth?: AuthCredentials | null): Promise<string> {
  const timeoutMs = getTimeoutMs();
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Validate URL (SSRF check) on every hop
    currentUrl = await validateUrl(currentUrl);

    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    };

    if (auth?.username) {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }

    const response = await fetch(currentUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Handle redirects manually
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect (${response.status}) with no Location header`);
      }
      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${currentUrl}`);
    }

    // Validate content type
    const contentType = response.headers.get('content-type');
    if (!isHtmlContentType(contentType)) {
      throw new Error(
        `Expected HTML content type, got: ${contentType || 'none'}`
      );
    }

    // Stream body with size cap
    if (!response.body) {
      throw new Error('Response has no body');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.byteLength;
        if (totalSize > MAX_BODY_SIZE) {
          reader.cancel();
          throw new Error(
            `Response body exceeds ${MAX_BODY_SIZE / 1024 / 1024} MB limit`
          );
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Combine chunks
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Detect encoding
    let charset = detectCharsetFromHeader(contentType);
    if (!charset) {
      charset = detectCharsetFromMeta(combined);
    }

    // Decode to UTF-8
    const encoding = charset || 'utf-8';
    try {
      const decoder = new TextDecoder(encoding);
      return decoder.decode(combined);
    } catch {
      // If the detected encoding is not supported, fall back to UTF-8
      return new TextDecoder('utf-8').decode(combined);
    }
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}
