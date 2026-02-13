import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkImages } from '../../src/lib/image-checker';
import type { ImageInfo } from '../../src/lib/types';

// Mock DNS and fetch to avoid real network calls
vi.mock('dns', () => {
  const mod = {
    promises: {
      lookup: vi.fn().mockResolvedValue([{ address: '1.2.3.4', family: 4 }]),
    },
  };
  return { ...mod, default: mod };
});

// Mock fetch for content hash layer — return different hashes by default
let fetchResponses: Map<string, ArrayBuffer> = new Map();
global.fetch = vi.fn().mockImplementation(async (url: string) => {
  const buf = fetchResponses.get(url);
  if (buf) {
    return {
      ok: true,
      body: {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: new Uint8Array(buf) };
            },
            cancel: async () => {},
            releaseLock: () => {},
          };
        },
      },
    };
  }
  return { ok: false, body: null };
}) as unknown as typeof fetch;

beforeEach(() => {
  fetchResponses = new Map();
});

describe('image-checker', () => {
  describe('Layer 1: Exact URL match', () => {
    it('matches identical URLs', async () => {
      const source: ImageInfo[] = [{ src: 'https://example.com/img.jpg', alt: 'test' }];
      const target: ImageInfo[] = [{ src: 'https://example.com/img.jpg', alt: 'test' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('exact-url');
    });
  });

  describe('Layer 2: Filename match', () => {
    it('matches same filename on different domains', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/uploads/photo.jpg', alt: '' }];
      const target: ImageInfo[] = [{ src: 'https://cdn.new.com/assets/photo.jpg', alt: '' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('filename');
    });
  });

  describe('Layer 3: Normalized filename match', () => {
    it('matches after stripping WP dimensions', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/banner-300x200.jpg', alt: '' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/banner.jpg', alt: '' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('normalized-filename');
    });

    it('matches after stripping trailing numbers', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/photo-993x512-1.jpg', alt: '' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/photo.jpg', alt: '' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('normalized-filename');
    });
  });

  describe('Layer 4: Substring filename match', () => {
    it('matches when target has CMS prefix added to source filename', async () => {
      const source: ImageInfo[] = [{
        src: 'https://old.com/wp-content/uploads/2021/03/brexit-rechnungswesen-993x512-1.jpg',
        alt: 'brexit-rechnungswesen',
      }];
      const target: ImageInfo[] = [{
        src: 'https://a.storyblok.com/f/123/blog_infografiken_brexit-rechnungswesen.jpg/m/filters:quality(80)',
        alt: 'Brexit und Rechnungswesen',
      }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('substring-filename');
    });

    it('matches when source name is contained in target name', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/hero-image.jpg', alt: '' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/blog_category_hero-image.jpg', alt: '' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('substring-filename');
    });

    it('matches when target name is contained in source name', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/blog_prefix_chart.png', alt: '' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/chart.png', alt: '' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('substring-filename');
    });

    it('does not match when extensions differ', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/photo.jpg', alt: '' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/prefix_photo.png', alt: '' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(0);
    });

    it('does not match short filenames to avoid false positives', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/ab.jpg', alt: '' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/xyzab.jpg', alt: '' }];
      const result = await checkImages(source, target);
      // "ab" base is only 2 chars, below the 4-char minimum
      expect(result.details[0].matchMethod).not.toBe('substring-filename');
    });
  });

  describe('Layer 6a: Exact alt text match', () => {
    it('matches identical alt text', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/a.jpg', alt: 'Company Logo' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/b.png', alt: 'Company Logo' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('alt-text');
    });
  });

  describe('Layer 6b: Fuzzy alt text match', () => {
    it('matches alt text with token overlap >= 50%', async () => {
      const source: ImageInfo[] = [{
        src: 'https://old.com/a.jpg',
        alt: 'brexit-rechnungswesen',
      }];
      const target: ImageInfo[] = [{
        src: 'https://new.com/completely-different.png',
        alt: 'Brexit und Rechnungswesen',
      }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('fuzzy-alt-text');
    });

    it('matches case-insensitive token overlap', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/a.jpg', alt: 'Annual Report Chart 2023' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/b.png', alt: 'annual report chart' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('fuzzy-alt-text');
    });

    it('does not match with low token overlap', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/a.jpg', alt: 'Company Logo Design' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/b.png', alt: 'Product Photo Gallery' }];
      const result = await checkImages(source, target);
      expect(result.found).toBe(0);
    });

    it('does not match alt text with fewer than 2 tokens', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/a.jpg', alt: 'logo' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/b.png', alt: 'logo' }];
      // Single token goes through exact alt match, not fuzzy
      const result = await checkImages(source, target);
      expect(result.found).toBe(1);
      expect(result.details[0].matchMethod).toBe('alt-text');
    });
  });

  describe('priority ordering', () => {
    it('prefers exact URL over filename', async () => {
      const source: ImageInfo[] = [{ src: 'https://cdn.com/photo.jpg', alt: '' }];
      const target: ImageInfo[] = [
        { src: 'https://cdn.com/photo.jpg', alt: '' },
        { src: 'https://other.com/photo.jpg', alt: '' },
      ];
      const result = await checkImages(source, target);
      expect(result.details[0].matchMethod).toBe('exact-url');
    });

    it('prefers filename over substring', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/hero.jpg', alt: '' }];
      const target: ImageInfo[] = [
        { src: 'https://new.com/hero.jpg', alt: '' },
        { src: 'https://new.com/prefix_hero.jpg', alt: '' },
      ];
      const result = await checkImages(source, target);
      expect(result.details[0].matchMethod).toBe('filename');
    });
  });

  describe('missing images', () => {
    it('reports images as missing when no match found', async () => {
      const source: ImageInfo[] = [{ src: 'https://old.com/unique.jpg', alt: 'unique image' }];
      const target: ImageInfo[] = [{ src: 'https://new.com/other.png', alt: 'something else' }];
      const result = await checkImages(source, target);
      expect(result.missing).toBe(1);
      expect(result.details[0].status).toBe('missing');
    });
  });
});
