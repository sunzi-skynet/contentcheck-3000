import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { ExtractionResult, ImageInfo } from './types';
import { validateSelector } from './url-validator';

const MAX_WORDS = 50_000;

// Noise elements to strip from any content root before text extraction and HTML output.
// These elements don't contribute meaningful content and pollute diff results.
const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'nav',
  '[role="navigation"]',
];

// Additional selectors to strip only when falling back to <body>
const BODY_STRIP_SELECTORS = [
  ...NOISE_SELECTORS,
  'header',
  'footer',
  'aside',
  '.sidebar',
  '.widget',
  '.cookie-banner',
  '.advertisement',
  '.ad',
  '.ads',
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

// HTML elements that are block-level and should have whitespace boundaries
const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'details',
  'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extract text from a DOM tree, inserting newlines at block element boundaries
 * to prevent concatenation like "HomeExcel" when adjacent elements have no whitespace.
 */
function extractTextWithSpacing(node: AnyNode): string {
  if (node.type === 'text') {
    return (node as unknown as { data: string }).data || '';
  }
  if (node.type === 'comment') return '';
  if (!('children' in node) || !node.children) return '';
  if (node.type === 'tag' || node.type === 'root') {
    const tagName = ('name' in node) ? (node as unknown as { name: string }).name?.toLowerCase() : '';
    const isBlock = BLOCK_ELEMENTS.has(tagName);
    const parts: string[] = [];
    if (isBlock) parts.push('\n');
    for (const child of node.children) {
      parts.push(extractTextWithSpacing(child as AnyNode));
    }
    if (isBlock) parts.push('\n');
    return parts.join('');
  }
  return '';
}

/**
 * Clean a content root by removing noise elements (style, script, nav, etc.)
 * Returns a new CheerioAPI with the cleaned content.
 */
function cleanContentRoot(
  root: cheerio.Cheerio<AnyNode>,
  selectorsToStrip: string[]
): cheerio.CheerioAPI {
  const $clean = cheerio.load(root.html() || '', null, false);
  for (const sel of selectorsToStrip) {
    $clean(sel).remove();
  }
  return $clean;
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

/**
 * Sanitize extracted content HTML for safe iframe rendering:
 * - Strip on* event handler attributes
 * - Resolve relative image src to absolute URLs
 */
function sanitizeContentHtml(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  pageUrl: string
): string {
  // Use fragment mode (false) to avoid adding <html><body> wrapper
  const $clone = cheerio.load(root.html() || '', null, false);

  // Strip on* event handler attributes from all elements
  $clone('*').each((_, el) => {
    const attribs = (el as unknown as { attribs?: Record<string, string> }).attribs;
    if (attribs) {
      for (const attr of Object.keys(attribs)) {
        if (attr.toLowerCase().startsWith('on')) {
          $clone(el).removeAttr(attr);
        }
      }
    }
  });

  // Resolve relative image src to absolute
  $clone('img').each((_, el) => {
    const src = $clone(el).attr('src');
    if (src) {
      $clone(el).attr('src', resolveUrl(src, pageUrl));
    }
  });

  return $clone.html() || '';
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
      const $clean = cleanContentRoot($('body'), BODY_STRIP_SELECTORS);
      const rawText = extractTextWithSpacing($clean.root()[0]);
      const text = normalizeWhitespace(rawText);
      const images = extractImages($, $('body'), pageUrl);
      const contentHtml = sanitizeContentHtml($clean, $clean.root(), pageUrl);
      return {
        title,
        text: truncateToWords(text, MAX_WORDS),
        images,
        contentHtml,
      };
    }
  }

  // Clean content root: strip noise elements from all content roots
  const $clean = cleanContentRoot(contentRoot, NOISE_SELECTORS);
  const rawText = extractTextWithSpacing($clean.root()[0]);
  const text = normalizeWhitespace(rawText);
  const images = extractImages($, contentRoot, pageUrl);
  const contentHtml = sanitizeContentHtml($clean, $clean.root(), pageUrl);

  return {
    title,
    text: truncateToWords(text, MAX_WORDS),
    images,
    contentHtml,
  };
}

function extractImages(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  pageUrl: string
): ImageInfo[] {
  const images: ImageInfo[] = [];
  const seen = new Set<string>();

  // <img> tags (skip data URIs — typically lazy-loading placeholders)
  root.find('img').each((_, el) => {
    const src = $(el).attr('src');
    if (!src || src.startsWith('data:')) return;
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
