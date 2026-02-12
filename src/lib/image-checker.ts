import { createHash } from 'crypto';
import type { ImageInfo, ImageDetail, ImageReport } from './types';
import { isPrivateIP } from './url-validator';
import { promises as dns } from 'dns';

const MAX_SOURCE_IMAGES = 50;
const IMAGE_FETCH_TIMEOUT_MS = 5_000;
const IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function getFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split('/').pop() || '';
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
      headers: { 'User-Agent': 'MigrationChecker/1.0' },
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

    const fname = getFilename(img.src);
    if (fname && !targetByFilename.has(fname)) {
      targetByFilename.set(fname, i);
    }

    const normFname = normalizeFilename(fname);
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
      // Layer 2: Filename match
      const fname = getFilename(src.src);
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
      // Layer 3: Normalized filename match
      const fname = getFilename(src.src);
      const normFname = normalizeFilename(fname);
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
      unmatchedSourceIndices.push(i);
    }
  }

  // Layer 4: Content hash matching (batch)
  if (unmatchedSourceIndices.length > 0 && unmatchedTargetIndices.length > 0) {
    // Fetch hashes for all unmatched source and target images in parallel
    const sourceHashPromises = unmatchedSourceIndices.map(async (i) => ({
      index: i,
      hash: await fetchImageHash(capped[i].src),
    }));
    const targetHashPromises = unmatchedTargetIndices.map(async (i) => ({
      index: i,
      hash: await fetchImageHash(targetImages[i].src),
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

  // Layer 5: Alt text match for remaining unmatched
  const stillUnmatched: number[] = [];
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
    stillUnmatched.push(srcIdx);
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
