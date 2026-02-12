import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { ExtractionResult, ImageInfo } from './types';
import { validateSelector } from './url-validator';

const MAX_WORDS = 50_000;

// Selectors to strip when falling back to <body>
const STRIP_SELECTORS = [
  'nav',
  'header',
  'footer',
  'aside',
  'script',
  'style',
  'noscript',
  'iframe',
  '.sidebar',
  '.widget',
  '.cookie-banner',
  '.advertisement',
  '.ad',
  '.ads',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
];

// Priority-based content selectors
const CONTENT_SELECTORS = [
  'main',
  'article',
  '[role="main"]',
  '#content',
  '.entry-content',
  '.post-content',
  '.page-content',
];

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ');
}

function resolveUrl(src: string, baseUrl: string): string {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}

export function extractContent(
  html: string,
  pageUrl: string,
  customSelector?: string | null
): ExtractionResult {
  const $ = cheerio.load(html);

  // Get title
  const title = $('title').first().text().trim();

  let contentRoot: cheerio.Cheerio<AnyNode>;

  if (customSelector) {
    if (!validateSelector(customSelector)) {
      throw new Error(
        `Unsafe CSS selector: "${customSelector}". Only tag names, classes, IDs, and simple combinators are allowed.`
      );
    }
    const selected = $(customSelector).first();
    if (selected.length === 0) {
      throw new Error(
        `Custom selector "${customSelector}" matched no elements`
      );
    }
    contentRoot = selected;
  } else {
    // Auto-detect using priority-based fallback
    let found = false;
    contentRoot = $('body');

    for (const selector of CONTENT_SELECTORS) {
      const match = $(selector).first();
      if (match.length > 0) {
        contentRoot = match;
        found = true;
        break;
      }
    }

    // If no semantic container found, fall back to body minus structural elements
    if (!found) {
      const bodyClone = $('body').clone();
      const $clone = cheerio.load(bodyClone.html() || '');
      for (const sel of STRIP_SELECTORS) {
        $clone(sel).remove();
      }
      const text = normalizeWhitespace($clone.root().text());
      const images = extractImages($, $('body'), pageUrl);
      return {
        title,
        text: truncateToWords(text, MAX_WORDS),
        images,
      };
    }
  }

  const text = normalizeWhitespace(contentRoot.text());
  const images = extractImages($, contentRoot, pageUrl);

  return {
    title,
    text: truncateToWords(text, MAX_WORDS),
    images,
  };
}

function extractImages(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  pageUrl: string
): ImageInfo[] {
  const images: ImageInfo[] = [];
  const seen = new Set<string>();

  // <img> tags
  root.find('img').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    const absoluteSrc = resolveUrl(src, pageUrl);
    if (seen.has(absoluteSrc)) return;
    seen.add(absoluteSrc);
    images.push({
      src: absoluteSrc,
      alt: $(el).attr('alt') || '',
    });
  });

  // <picture> <source> elements
  root.find('picture source').each((_, el) => {
    const srcset = $(el).attr('srcset');
    if (!srcset) return;
    // Take the first URL from srcset
    const firstSrc = srcset.split(',')[0].trim().split(/\s+/)[0];
    if (!firstSrc) return;
    const absoluteSrc = resolveUrl(firstSrc, pageUrl);
    if (seen.has(absoluteSrc)) return;
    seen.add(absoluteSrc);
    images.push({
      src: absoluteSrc,
      alt: '',
    });
  });

  return images;
}
