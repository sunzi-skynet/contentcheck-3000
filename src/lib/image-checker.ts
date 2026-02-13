import { createHash } from 'crypto';
import type { ImageInfo, ImageDetail, ImageReport } from './types';
import { isPrivateIP } from './url-validator';
import { promises as dns } from 'dns';

const MAX_SOURCE_IMAGES = 50;
const IMAGE_FETCH_TIMEOUT_MS = 5_000;
const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif|tiff?)$/i;

function getFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    // CDN URLs often have the real filename mid-path with processing params after
    // e.g. .../image.jpg/m/filters:quality(80)
    // Scan segments for one that looks like an image file
    for (let i = segments.length - 1; i >= 0; i--) {
      if (IMAGE_EXTENSIONS.test(segments[i])) {
        return segments[i];
      }
    }
    // Fallback: last segment
    return segments[segments.length - 1] || '';
  } catch {
    return '';
  }
}

function normalizeFilename(filename: string): string {
  // Strip CMS-generated hashes/dimensions
  // e.g. "banner-300x200-a3f8b2c.jpg" → "banner.jpg"
  // e.g. "image-1024x768.png" → "image.png"
  const ext = filename.match(/\.[a-z0-9]+$/i)?.[0] || '';
  const base = filename.slice(0, filename.length - ext.length);

  const cleaned = base
    .replace(/-\d+x\d+/g, '') // Remove dimensions like -300x200
    .replace(/-[a-f0-9]{6,}/gi, '') // Remove hashes like -a3f8b2c
    .replace(/_\d+x\d+/g, '') // Remove dimensions like _300x200
    .replace(/_[a-f0-9]{6,}/gi, '') // Remove hashes with underscore
    .replace(/-scaled$/i, '') // WordPress "scaled" suffix
    .replace(/-\d+$/g, ''); // Trailing numbers

  return (cleaned || base) + ext;
}

/**
 * Strip CDN image transformation parameters to get the original uploaded file URL.
 * This improves content-hash matching because CDN transforms (resize, quality, etc.)
 * change the image bytes even when the underlying file is identical.
 */
export function stripCdnTransforms(url: string): string {
  try {
    const parsed = new URL(url);

    // Storyblok: strip /m/... transform pipeline from path
    // e.g. .../image.png/m/filters:quality(80) → .../image.png
    if (parsed.hostname.includes('storyblok.com')) {
      const pathMatch = parsed.pathname.match(
        /^(.*\.(?:jpe?g|png|gif|webp|avif|svg|bmp|ico|tiff?))\/m\/.*/i
      );
      if (pathMatch) {
        parsed.pathname = pathMatch[1];
        parsed.search = '';
        return parsed.toString();
      }
    }

    // General: strip common image CDN query params (Imgix, WordPress Photon, etc.)
    if (parsed.search) {
      const cdnParams = new Set([
        'w', 'h', 'width', 'height', 'quality', 'q',
        'fit', 'crop', 'resize', 'format', 'auto', 'dpr',
      ]);
      const params = new URLSearchParams(parsed.search);
      let changed = false;
      for (const key of Array.from(params.keys())) {
        if (cdnParams.has(key.toLowerCase())) {
          params.delete(key);
          changed = true;
        }
      }
      if (changed) {
        parsed.search = params.toString();
        return parsed.toString();
      }
    }

    return url;
  } catch {
    return url;
  }
}

async function isUrlSafe(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const result = await dns.lookup(parsed.hostname, { all: true });
    return result.every((r) => !isPrivateIP(r.address));
  } catch {
    return false;
  }
}

async function fetchImageHash(url: string): Promise<string | null> {
  if (!(await isUrlSafe(url))) return null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'ContentCheck3000/1.0' },
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.byteLength;
        if (totalSize > IMAGE_MAX_SIZE) {
          reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return createHash('sha256').update(combined).digest('hex');
  } catch {
    return null;
  }
}

export async function checkImages(
  sourceImages: ImageInfo[],
  targetImages: ImageInfo[]
): Promise<ImageReport> {
  // Cap source images
  const capped = sourceImages.slice(0, MAX_SOURCE_IMAGES);
  const details: ImageDetail[] = [];
  const unmatchedSourceIndices: number[] = [];
  const unmatchedTargetIndices: number[] = Array.from(
    { length: targetImages.length },
    (_, i) => i
  );

  // Build target lookup maps
  const targetByUrl = new Map<string, number>();
  const targetByFilename = new Map<string, number>();
  const targetByNormFilename = new Map<string, number>();
  const targetByAlt = new Map<string, number>();

  for (let i = 0; i < targetImages.length; i++) {
    const img = targetImages[i];
    targetByUrl.set(img.src, i);

    const fname = getFilename(img.src).toLowerCase();
    if (fname && !targetByFilename.has(fname)) {
      targetByFilename.set(fname, i);
    }

    const normFname = normalizeFilename(fname).toLowerCase();
    if (normFname && !targetByNormFilename.has(normFname)) {
      targetByNormFilename.set(normFname, i);
    }

    if (img.alt && !targetByAlt.has(img.alt)) {
      targetByAlt.set(img.alt, i);
    }
  }

  // Layer 1-3: URL, filename, normalized filename matching
  for (let i = 0; i < capped.length; i++) {
    const src = capped[i];
    let matched = false;

    // Layer 1: Exact URL match
    const urlIdx = targetByUrl.get(src.src);
    if (urlIdx !== undefined) {
      details.push({
        src: src.src,
        alt: src.alt,
        status: 'found',
        matchMethod: 'exact-url',
        targetMatch: targetImages[urlIdx].src,
      });
      removeFromArray(unmatchedTargetIndices, urlIdx);
      matched = true;
    }

    if (!matched) {
      // Layer 2: Filename match (case-insensitive)
      const fname = getFilename(src.src).toLowerCase();
      const fnameIdx = targetByFilename.get(fname);
      if (fname && fnameIdx !== undefined && unmatchedTargetIndices.includes(fnameIdx)) {
        details.push({
          src: src.src,
          alt: src.alt,
          status: 'found',
          matchMethod: 'filename',
          targetMatch: targetImages[fnameIdx].src,
        });
        removeFromArray(unmatchedTargetIndices, fnameIdx);
        matched = true;
      }
    }

    if (!matched) {
      // Layer 3: Normalized filename match (case-insensitive)
      const fname = getFilename(src.src).toLowerCase();
      const normFname = normalizeFilename(fname).toLowerCase();
      const normIdx = targetByNormFilename.get(normFname);
      if (normFname && normIdx !== undefined && unmatchedTargetIndices.includes(normIdx)) {
        details.push({
          src: src.src,
          alt: src.alt,
          status: 'found',
          matchMethod: 'normalized-filename',
          targetMatch: targetImages[normIdx].src,
        });
        removeFromArray(unmatchedTargetIndices, normIdx);
        matched = true;
      }
    }

    if (!matched) {
      // Layer 4: Substring match on normalized filenames
      // Catches renames where one CMS adds a prefix, e.g.
      // "brexit-rechnungswesen.jpg" matches "blog_infografiken_brexit-rechnungswesen.jpg"
      const fname = getFilename(src.src).toLowerCase();
      const normFname = normalizeFilename(fname);
      const normBase = normFname.replace(/\.[a-z0-9]+$/i, '');
      if (normBase.length >= 4) {
        for (const tgtIdx of unmatchedTargetIndices) {
          const tgtFname = getFilename(targetImages[tgtIdx].src).toLowerCase();
          const tgtNorm = normalizeFilename(tgtFname);
          const tgtBase = tgtNorm.replace(/\.[a-z0-9]+$/i, '');
          const tgtExt = tgtNorm.slice(tgtBase.length);
          const srcExt = normFname.slice(normBase.length);
          // Extensions must match, and the shorter base must be contained in the longer
          if (srcExt === tgtExt && tgtBase.length >= 4) {
            const shorter = normBase.length <= tgtBase.length ? normBase : tgtBase;
            const longer = normBase.length <= tgtBase.length ? tgtBase : normBase;
            if (longer.includes(shorter)) {
              details.push({
                src: src.src,
                alt: src.alt,
                status: 'found',
                matchMethod: 'substring-filename',
                targetMatch: targetImages[tgtIdx].src,
              });
              removeFromArray(unmatchedTargetIndices, tgtIdx);
              matched = true;
              break;
            }
          }
        }
      }
    }

    if (!matched) {
      unmatchedSourceIndices.push(i);
    }
  }

  // Layer 5: Content hash matching (batch)
  // Use stripped CDN URLs to compare original file bytes (transforms change hashes)
  if (unmatchedSourceIndices.length > 0 && unmatchedTargetIndices.length > 0) {
    // Fetch hashes for all unmatched source and target images in parallel
    // Try stripped URL first (original file), fall back to transformed URL
    const fetchHashWithFallback = async (url: string): Promise<string | null> => {
      const cleanUrl = stripCdnTransforms(url);
      if (cleanUrl !== url) {
        const hash = await fetchImageHash(cleanUrl);
        if (hash) return hash;
      }
      return fetchImageHash(url);
    };

    const sourceHashPromises = unmatchedSourceIndices.map(async (i) => ({
      index: i,
      hash: await fetchHashWithFallback(capped[i].src),
    }));
    const targetHashPromises = unmatchedTargetIndices.map(async (i) => ({
      index: i,
      hash: await fetchHashWithFallback(targetImages[i].src),
    }));

    const [sourceHashes, targetHashes] = await Promise.all([
      Promise.all(sourceHashPromises),
      Promise.all(targetHashPromises),
    ]);

    // Build target hash map
    const targetHashMap = new Map<string, number>();
    for (const { index, hash } of targetHashes) {
      if (hash && !targetHashMap.has(hash)) {
        targetHashMap.set(hash, index);
      }
    }

    // Match source hashes against target hashes
    const hashMatched = new Set<number>();
    for (const { index: srcIdx, hash } of sourceHashes) {
      if (hash) {
        const tgtIdx = targetHashMap.get(hash);
        if (tgtIdx !== undefined && !hashMatched.has(srcIdx)) {
          details.push({
            src: capped[srcIdx].src,
            alt: capped[srcIdx].alt,
            status: 'found',
            matchMethod: 'content-hash',
            targetMatch: targetImages[tgtIdx].src,
          });
          hashMatched.add(srcIdx);
          removeFromArray(unmatchedSourceIndices, srcIdx);
          removeFromArray(unmatchedTargetIndices, tgtIdx);
        }
      }
    }
  }

  // Layer 6a: Exact alt text match for remaining unmatched
  const afterExactAlt: number[] = [];
  for (const srcIdx of unmatchedSourceIndices) {
    const src = capped[srcIdx];
    if (src.alt) {
      const altIdx = targetByAlt.get(src.alt);
      if (altIdx !== undefined && unmatchedTargetIndices.includes(altIdx)) {
        details.push({
          src: src.src,
          alt: src.alt,
          status: 'found',
          matchMethod: 'alt-text',
          targetMatch: targetImages[altIdx].src,
        });
        removeFromArray(unmatchedTargetIndices, altIdx);
        continue;
      }
    }
    afterExactAlt.push(srcIdx);
  }

  // Layer 6b: Fuzzy alt text match — token overlap (case-insensitive)
  const stillUnmatched: number[] = [];
  for (const srcIdx of afterExactAlt) {
    const src = capped[srcIdx];
    const srcTokens = tokenizeAlt(src.alt);
    if (srcTokens.size < 2) {
      stillUnmatched.push(srcIdx);
      continue;
    }
    let bestIdx = -1;
    let bestScore = 0;
    for (const tgtIdx of unmatchedTargetIndices) {
      const tgtTokens = tokenizeAlt(targetImages[tgtIdx].alt);
      if (tgtTokens.size < 2) continue;
      const overlap = countOverlap(srcTokens, tgtTokens);
      const score = overlap / Math.max(srcTokens.size, tgtTokens.size);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestIdx = tgtIdx;
      }
    }
    if (bestIdx !== -1) {
      details.push({
        src: src.src,
        alt: src.alt,
        status: 'found',
        matchMethod: 'fuzzy-alt-text',
        targetMatch: targetImages[bestIdx].src,
      });
      removeFromArray(unmatchedTargetIndices, bestIdx);
    } else {
      stillUnmatched.push(srcIdx);
    }
  }

  // Mark remaining as missing
  for (const srcIdx of stillUnmatched) {
    details.push({
      src: capped[srcIdx].src,
      alt: capped[srcIdx].alt,
      status: 'missing',
    });
  }

  const found = details.filter((d) => d.status === 'found').length;

  return {
    total: capped.length,
    found,
    missing: capped.length - found,
    details,
  };
}

function removeFromArray(arr: number[], value: number): void {
  const idx = arr.indexOf(value);
  if (idx !== -1) arr.splice(idx, 1);
}

function tokenizeAlt(alt: string): Set<string> {
  if (!alt) return new Set();
  return new Set(
    alt
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, ' ')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of Array.from(a)) {
    if (b.has(token)) count++;
  }
  return count;
}
