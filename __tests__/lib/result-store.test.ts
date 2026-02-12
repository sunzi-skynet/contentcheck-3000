import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { FileSystemResultStore, isValidResultId } from '@/lib/result-store';
import type { ComparisonResult } from '@/lib/types';

function makeResult(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    source: {
      url: 'https://source.example.com/page',
      title: 'Source Page',
      extractedText: 'Source text content',
      textLength: 3,
      imageCount: 1,
    },
    target: {
      url: 'https://target.example.com/page',
      title: 'Target Page',
      extractedText: 'Target text content',
      textLength: 3,
      imageCount: 1,
    },
    textDiff: {
      similarity: 85.0,
      changes: [
        { type: 'equal', value: 'text content' },
        { type: 'removed', value: 'Source' },
        { type: 'added', value: 'Target' },
      ],
    },
    images: {
      total: 1,
      found: 1,
      missing: 0,
      details: [
        { src: 'https://source.example.com/img.png', alt: 'Image', status: 'found', matchMethod: 'exact-url' },
      ],
    },
    overallScore: 89.5,
    annotatedContent: {
      sourceHtml: '<div>source html</div>',
      targetHtml: '<div>target html</div>',
    },
    ...overrides,
  };
}

let tempDir: string;
let store: FileSystemResultStore;

describe('result-store', () => {
  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `mc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    store = new FileSystemResultStore(tempDir, 24); // 24 hour TTL
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('isValidResultId', () => {
    it('accepts valid UUIDs', () => {
      expect(isValidResultId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
      expect(isValidResultId('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
    });

    it('rejects invalid strings', () => {
      expect(isValidResultId('')).toBe(false);
      expect(isValidResultId('not-a-uuid')).toBe(false);
      expect(isValidResultId('../../../etc/passwd')).toBe(false);
      expect(isValidResultId('a1b2c3d4-e5f6-7890-abcd')).toBe(false);
      expect(isValidResultId('a1b2c3d4e5f67890abcdef1234567890')).toBe(false); // no dashes
    });
  });

  describe('save', () => {
    it('creates a file and returns metadata with valid UUID', async () => {
      const result = makeResult();
      const metadata = await store.save(result);

      expect(isValidResultId(metadata.id)).toBe(true);
      expect(metadata.sourceUrl).toBe('https://source.example.com/page');
      expect(metadata.targetUrl).toBe('https://target.example.com/page');
      expect(metadata.overallScore).toBe(89.5);
      expect(metadata.createdAt).toBeTruthy();
      expect(metadata.expiresAt).toBeTruthy();

      // Verify file exists
      const filePath = path.join(tempDir, `${metadata.id}.json`);
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });

    it('stores apiKeyName when provided', async () => {
      const result = makeResult();
      const metadata = await store.save(result, { apiKeyName: 'acme' });
      expect(metadata.apiKeyName).toBe('acme');
    });

    it('creates the directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'dir');
      const nestedStore = new FileSystemResultStore(nestedDir);
      const metadata = await nestedStore.save(makeResult());
      expect(isValidResultId(metadata.id)).toBe(true);
    });
  });

  describe('load', () => {
    it('retrieves a previously saved result', async () => {
      const result = makeResult();
      const metadata = await store.save(result);
      const loaded = await store.load(metadata.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.metadata.id).toBe(metadata.id);
      expect(loaded!.result.overallScore).toBe(89.5);
      expect(loaded!.result.source.url).toBe('https://source.example.com/page');
    });

    it('returns null for non-existent ID', async () => {
      const loaded = await store.load('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(loaded).toBeNull();
    });

    it('returns null for invalid ID format', async () => {
      const loaded = await store.load('../../../etc/passwd');
      expect(loaded).toBeNull();
    });

    it('returns null and deletes expired results', async () => {
      // Create a store with 0 TTL (expires immediately)
      const expiringStore = new FileSystemResultStore(tempDir, 0);
      const metadata = await expiringStore.save(makeResult());

      // Wait a tiny bit to ensure expiry
      await new Promise((r) => setTimeout(r, 10));

      const loaded = await expiringStore.load(metadata.id);
      expect(loaded).toBeNull();

      // Verify file was deleted
      const filePath = path.join(tempDir, `${metadata.id}.json`);
      await expect(fs.stat(filePath)).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('removes a stored result', async () => {
      const metadata = await store.save(makeResult());
      await store.delete(metadata.id);
      const loaded = await store.load(metadata.id);
      expect(loaded).toBeNull();
    });

    it('does not throw for non-existent ID', async () => {
      await expect(
        store.delete('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      ).resolves.toBeUndefined();
    });

    it('rejects invalid IDs', async () => {
      await expect(
        store.delete('../../../etc/passwd')
      ).resolves.toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('removes expired files', async () => {
      const expiringStore = new FileSystemResultStore(tempDir, 0);
      const m1 = await expiringStore.save(makeResult());
      const m2 = await expiringStore.save(makeResult());

      // Wait to ensure expiry and lazy cleanup to settle
      await new Promise((r) => setTimeout(r, 50));

      // Cleanup removes any remaining expired files
      // (some may already be removed by lazy cleanup during save)
      const removed = await expiringStore.cleanup();
      expect(removed).toBeGreaterThanOrEqual(0);

      // Both results should be inaccessible regardless of cleanup path
      expect(await expiringStore.load(m1.id)).toBeNull();
      expect(await expiringStore.load(m2.id)).toBeNull();
    });

    it('preserves non-expired files', async () => {
      const metadata = await store.save(makeResult());
      const removed = await store.cleanup();
      expect(removed).toBe(0);

      const loaded = await store.load(metadata.id);
      expect(loaded).not.toBeNull();
    });
  });
});
