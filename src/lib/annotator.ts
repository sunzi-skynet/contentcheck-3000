import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { DiffChange, ImageDetail, AnnotatedContent } from './types';

type HighlightClass = 'migrated' | 'not-migrated' | 'migrated-moved';

interface TaggedChar {
  char: string;
  cssClass: HighlightClass;
}

/**
 * Annotate source and target content HTML with diff highlights and image status borders.
 *
 * sourceText/targetText are the extracted plain text from each page — used to detect
 * content that was reordered (moved) between pages. Moved content is marked as "migrated"
 * rather than "not-migrated".
 */
export function annotateContent(
  sourceHtml: string,
  targetHtml: string,
  diffChanges: DiffChange[],
  imageDetails: ImageDetail[],
  sourceText: string,
  targetText: string
): AnnotatedContent {
  const sourceAnnotated = annotateView(sourceHtml, diffChanges, imageDetails, 'source', targetText);
  const targetAnnotated = annotateView(targetHtml, diffChanges, imageDetails, 'target', sourceText);
  return { sourceHtml: sourceAnnotated, targetHtml: targetAnnotated };
}

function annotateView(
  contentHtml: string,
  diffChanges: DiffChange[],
  imageDetails: ImageDetail[],
  side: 'source' | 'target',
  otherSideText: string
): string {
  const $ = cheerio.load(contentHtml, null, false);

  // Defense-in-depth: strip any remaining script/style tags from content.
  // The extractor already strips these, but since we use allow-same-origin
  // on the iframe sandbox, ensure no foreign scripts can execute.
  $('script').remove();

  // Build character-level annotation data from diff changes
  const taggedChars = buildTaggedChars(diffChanges, side, otherSideText);

  // Annotate text nodes
  annotateTextNodes($, taggedChars);

  // Annotate images
  annotateImages($, imageDetails, side);

  // Tag block elements with indices and insert alignment spacers
  tagBlockElements($);

  // Source defaults to showing not-migrated (red), target to migrated (green)
  const defaultMode = side === 'source' ? 'not-migrated' : 'migrated';
  return wrapInHtmlDocument($.html(), defaultMode);
}

/**
 * Normalize text for moved-content lookup: lowercase, collapse whitespace, trim.
 */
function normalizeForLookup(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Check if a text segment exists on the other side's extracted text.
 * Only returns true for segments that are "substantial" enough to avoid
 * false positives from common short words.
 *
 * Threshold: 2+ words, or a single word with 10+ characters.
 */
function isMovedContent(segment: string, otherSideNormalized: string): boolean {
  const normalized = normalizeForLookup(segment);
  if (normalized.length < 3) return false;

  const words = normalized.split(' ');
  if (words.length < 2 && normalized.length < 10) return false;

  return otherSideNormalized.includes(normalized);
}

/**
 * Build a flat array of non-whitespace characters tagged with their highlight class.
 * Only includes characters from changes relevant to the given side.
 *
 * cheerio's .text() concatenates text nodes without spaces, and the differ
 * operates on that normalized text. By matching at the character level (skipping
 * whitespace), we correctly handle cases where adjacent elements produce
 * concatenated words like "HomeExcel" in the diff but "Home" + "Excel" in the DOM.
 *
 * For removed/added changes, segments are checked against the other side's text
 * to detect moved (reordered) content. Moved segments are marked as "migrated"
 * rather than "not-migrated", since the content exists on both pages.
 */
function buildTaggedChars(
  diffChanges: DiffChange[],
  side: 'source' | 'target',
  otherSideText: string
): TaggedChar[] {
  const result: TaggedChar[] = [];
  const otherSideNormalized = normalizeForLookup(otherSideText);

  for (const change of diffChanges) {
    if (side === 'source') {
      if (change.type === 'equal') {
        pushChars(result, change.value, 'migrated');
      } else if (change.type === 'removed') {
        pushCharsWithMovedCheck(result, change.value, 'not-migrated', otherSideNormalized);
      }
      // skip 'added' — doesn't appear in source text
    } else {
      if (change.type === 'equal') {
        pushChars(result, change.value, 'migrated');
      } else if (change.type === 'added') {
        pushCharsWithMovedCheck(result, change.value, 'not-migrated', otherSideNormalized);
      }
      // skip 'removed' — doesn't appear in target text
    }
  }

  return result;
}

/**
 * Push non-whitespace characters from text with a fixed highlight class.
 */
function pushChars(result: TaggedChar[], text: string, cssClass: HighlightClass): void {
  for (const char of text) {
    if (!/\s/.test(char)) {
      result.push({ char, cssClass });
    }
  }
}

/**
 * Push non-whitespace characters from a removed/added change, splitting by paragraph
 * boundaries and checking each segment against the other side's text.
 * Segments found on the other side are marked as "migrated" (moved content).
 */
function pushCharsWithMovedCheck(
  result: TaggedChar[],
  text: string,
  defaultClass: HighlightClass,
  otherSideNormalized: string
): void {
  // Split by paragraph breaks (double newlines, possibly with whitespace between)
  const segments = text.split(/\n\s*\n/);

  for (const segment of segments) {
    const trimmed = segment.trim();
    const cssClass = isMovedContent(trimmed, otherSideNormalized) ? 'migrated-moved' : defaultClass;
    pushChars(result, segment, cssClass);
  }
}

/**
 * Walk all text nodes in document order and annotate them using character-level
 * matching against the tagged character stream.
 *
 * Non-whitespace characters are matched one-to-one in order.
 * Whitespace characters inherit the highlight class from the surrounding context.
 */
function annotateTextNodes(
  $: cheerio.CheerioAPI,
  taggedChars: TaggedChar[]
): void {
  if (taggedChars.length === 0) return;

  // Collect all text nodes in document order
  const textNodes: AnyNode[] = [];
  collectTextNodes($.root()[0], textNodes);

  let charPtr = 0;
  let lastCssClass: HighlightClass | null = null;

  for (const node of textNodes) {
    if (node.type !== 'text') continue;
    const textContent = (node as unknown as { data: string }).data;
    if (!textContent || !textContent.trim()) continue;

    const parts: string[] = [];
    let currentClass: HighlightClass | null = null;
    let currentRun = '';

    for (const ch of textContent) {
      let charClass: HighlightClass | null;

      if (/\s/.test(ch)) {
        // Whitespace: inherit highlight from surrounding non-ws context
        charClass = lastCssClass;
      } else if (charPtr < taggedChars.length && ch === taggedChars[charPtr].char) {
        // Non-whitespace match — consume from tagged stream
        charClass = taggedChars[charPtr].cssClass;
        lastCssClass = charClass;
        charPtr++;
      } else {
        // Non-whitespace mismatch — output untagged
        charClass = null;
      }

      // If highlight class changed, flush the current run
      if (charClass !== currentClass) {
        if (currentRun) {
          parts.push(formatRun(currentRun, currentClass));
        }
        currentClass = charClass;
        currentRun = ch;
      } else {
        currentRun += ch;
      }
    }

    // Flush last run
    if (currentRun) {
      parts.push(formatRun(currentRun, currentClass));
    }

    if (parts.length > 0) {
      $(node).replaceWith(parts.join(''));
    }
  }
}

/**
 * Format a run of text with a highlight class as a <mark> element,
 * or as escaped plain text if no class.
 */
function formatRun(text: string, cssClass: HighlightClass | null): string {
  const escaped = escapeHtml(text);
  if (cssClass === 'migrated-moved') {
    // Visually same as migrated (CSS mark.migrated applies), but 'moved' class
    // lets the alignment script exclude it from isShared detection
    return `<mark class="migrated moved">${escaped}</mark>`;
  }
  if (cssClass) {
    return `<mark class="${cssClass}">${escaped}</mark>`;
  }
  return escaped;
}

/**
 * Recursively collect text nodes in document order.
 */
function collectTextNodes(node: AnyNode, result: AnyNode[]): void {
  if (node.type === 'text') {
    result.push(node);
    return;
  }
  if ('children' in node && node.children) {
    for (const child of node.children) {
      collectTextNodes(child as AnyNode, result);
    }
  }
}

/**
 * Annotate <img> elements with migrated/not-migrated classes.
 */
function annotateImages(
  $: cheerio.CheerioAPI,
  imageDetails: ImageDetail[],
  side: 'source' | 'target'
): void {
  if (side === 'source') {
    // Source view: use image report directly
    const statusBySrc = new Map<string, ImageDetail['status']>();
    for (const img of imageDetails) {
      statusBySrc.set(img.src, img.status);
    }

    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      const status = statusBySrc.get(src) ?? findStatusByFilename(src, imageDetails);
      if (status === 'found') {
        $(el).addClass('img-migrated');
      } else if (status === 'missing' || status === 'unverified') {
        $(el).addClass('img-not-migrated');
      }
    });
  } else {
    // Target view: images that matched a source image are "migrated"
    const matchedTargetUrls = new Set<string>();
    for (const img of imageDetails) {
      if (img.status === 'found' && img.targetMatch) {
        matchedTargetUrls.add(img.targetMatch);
      }
    }

    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (matchedTargetUrls.has(src) || matchedTargetUrlByFilename(src, matchedTargetUrls)) {
        $(el).addClass('img-migrated');
      } else {
        $(el).addClass('img-not-migrated');
      }
    });
  }
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif|tiff?)$/i;

/**
 * Extract a meaningful image filename from a URL, handling CDN URLs where
 * the real filename may be mid-path (e.g. .../image.jpg/m/filters:quality(80))
 */
function getImageFilename(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (IMAGE_EXTENSIONS.test(segments[i])) return segments[i];
    }
    return segments[segments.length - 1] || '';
  } catch {
    return url.split('/').pop() || '';
  }
}

function findStatusByFilename(src: string, imageDetails: ImageDetail[]): ImageDetail['status'] | null {
  const filename = getImageFilename(src);
  if (!filename) return null;
  for (const img of imageDetails) {
    const imgFilename = getImageFilename(img.src);
    if (imgFilename === filename) return img.status;
  }
  return null;
}

function matchedTargetUrlByFilename(src: string, matchedUrls: Set<string>): boolean {
  const filename = getImageFilename(src);
  if (!filename) return false;
  const urls = Array.from(matchedUrls);
  for (const url of urls) {
    const urlFilename = getImageFilename(url);
    if (urlFilename === filename) return true;
  }
  return false;
}

/**
 * Content block tags that typically contain text directly.
 * These are "leaf" blocks used for alignment anchoring.
 */
const LEAF_BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'dt', 'dd', 'figcaption', 'pre', 'summary', 'th', 'td',
]);

/** Standalone visual elements that serve as alignment blocks. */
const STANDALONE_BLOCK_TAGS = new Set(['img', 'hr']);

/**
 * Walk the DOM and tag content blocks with sequential `data-block-idx` attributes.
 * Insert a zero-height `<div class="sync-spacer">` before each block for alignment.
 *
 * Only "leaf" block elements (those that don't contain other block elements) are tagged,
 * plus standalone visual elements like <img> and <hr>.
 */
function tagBlockElements($: cheerio.CheerioAPI): void {
  // Phase 1: collect block elements in document order
  const blocks: AnyNode[] = [];

  function walk(node: AnyNode): void {
    if (node.type !== 'tag') return;
    const tag = (node as unknown as { tagName: string }).tagName?.toLowerCase();

    if (tag && LEAF_BLOCK_TAGS.has(tag)) {
      if ($(node).text().trim()) {
        blocks.push(node);
      }
      return; // Don't recurse into leaf blocks
    }

    if (tag && STANDALONE_BLOCK_TAGS.has(tag)) {
      blocks.push(node);
      return;
    }

    // Recurse into non-block containers
    if ('children' in node && node.children) {
      for (const child of node.children) {
        walk(child as AnyNode);
      }
    }
  }

  const root = $.root()[0];
  if (root && 'children' in root && root.children) {
    for (const child of root.children) {
      walk(child as AnyNode);
    }
  }

  // Phase 2: tag collected blocks and insert spacers
  for (let i = 0; i < blocks.length; i++) {
    const $el = $(blocks[i]);
    $el.attr('data-block-idx', String(i));
    $el.before(`<div class="sync-spacer" data-spacer="${i}" style="height:0px"></div>`);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wrap annotated content in a full HTML document with highlight styles,
 * sync-scroll support, and a message handler for parent communication.
 */
function wrapInHtmlDocument(annotatedBody: string, defaultMode: 'migrated' | 'not-migrated' = 'migrated'): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: system-ui, -apple-system, sans-serif;
    padding: 1rem;
    line-height: 1.6;
    color: #1f2937;
    margin: 0;
  }
  img {
    max-width: 100%;
    height: auto;
  }

  /* Text highlights — transparent by default */
  mark.migrated,
  mark.not-migrated {
    background-color: transparent;
    color: inherit;
    padding: 0;
  }

  /* Image borders — transparent by default */
  img.img-migrated,
  img.img-not-migrated {
    border: 3px solid transparent;
    border-radius: 2px;
  }

  /* Green mode: show migrated content */
  body.show-migrated mark.migrated {
    background-color: #bbf7d0;
    color: #166534;
  }
  body.show-migrated img.img-migrated {
    border-color: #22c55e;
  }

  /* Red mode: show not-migrated content */
  body.show-not-migrated mark.not-migrated {
    background-color: #fecaca;
    color: #991b1b;
  }
  body.show-not-migrated img.img-not-migrated {
    border-color: #ef4444;
  }

  /* Alignment spacers for sync scroll */
  .sync-spacer {
    height: 0;
    overflow: hidden;
    transition: height 0.15s ease;
  }
</style>
</head>
<body class="show-${defaultMode}">
${annotatedBody}
<script>
(function() {
  var _syncEnabled = false;
  var _isProgrammatic = false;
  var _sideId = null;

  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'toggle-highlight':
        document.body.className = 'show-' + data.mode;
        break;

      case 'measure-blocks':
        var elems = document.querySelectorAll('[data-block-idx]');
        var measurements = [];
        var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        for (var i = 0; i < elems.length; i++) {
          var block = elems[i];
          var rect = block.getBoundingClientRect();
          var migratedChars = 0;
          var notMigratedChars = 0;
          var marks = block.querySelectorAll('mark');
          for (var j = 0; j < marks.length; j++) {
            var txt = marks[j].textContent || '';
            // Exclude moved content from shared detection — moved content
            // is at a different position on each side, so it's not a valid alignment anchor
            if (marks[j].classList.contains('migrated') && !marks[j].classList.contains('moved')) migratedChars += txt.length;
            if (marks[j].classList.contains('not-migrated')) notMigratedChars += txt.length;
          }
          if (block.tagName === 'IMG') {
            if (block.classList.contains('img-migrated')) migratedChars = 1;
            if (block.classList.contains('img-not-migrated')) notMigratedChars = 1;
          }
          measurements.push({
            idx: parseInt(block.getAttribute('data-block-idx'), 10),
            top: rect.top + scrollTop,
            height: rect.height,
            isShared: migratedChars >= notMigratedChars && migratedChars > 0,
            text: (block.textContent || '').trim().slice(0, 200)
          });
        }
        console.log('[sync-debug] ' + _sideId + ' measure-blocks:', measurements.length, 'blocks,', measurements.filter(function(m) { return m.isShared; }).length, 'shared');
        for (var di = 0; di < measurements.length; di++) {
          var dm = measurements[di];
          console.log('[sync-debug]   [' + dm.idx + '] top=' + Math.round(dm.top) + ' h=' + Math.round(dm.height) + ' shared=' + dm.isShared);
        }
        parent.postMessage({ type: 'block-measurements', sideId: _sideId, blocks: measurements }, '*');
        break;

      case 'set-spacers':
        var spacers = data.spacers;
        var spacerKeys = Object.keys(spacers);
        console.log('[sync-debug] ' + _sideId + ' set-spacers: ' + spacerKeys.length + ' spacers', spacers);
        for (var key in spacers) {
          var el = document.querySelector('.sync-spacer[data-spacer="' + key + '"]');
          if (el) {
            el.style.height = spacers[key] + 'px';
            console.log('[sync-debug]   spacer[' + key + '] = ' + spacers[key] + 'px (found)');
          } else {
            console.warn('[sync-debug]   spacer[' + key + '] = ' + spacers[key] + 'px (NOT FOUND in DOM)');
          }
        }
        break;

      case 'clear-spacers':
        var allSpacers = document.querySelectorAll('.sync-spacer');
        for (var k = 0; k < allSpacers.length; k++) {
          allSpacers[k].style.height = '0px';
        }
        break;

      case 'scroll-to':
        _isProgrammatic = true;
        window.scrollTo(0, data.scrollTop);
        break;

      case 'sync-enable':
        _syncEnabled = true;
        if (data.sideId) _sideId = data.sideId;
        break;

      case 'sync-disable':
        _syncEnabled = false;
        break;
    }
  });

  window.addEventListener('scroll', function() {
    if (_isProgrammatic) {
      _isProgrammatic = false;
      return;
    }
    if (!_syncEnabled) return;
    parent.postMessage({
      type: 'scroll-update',
      sideId: _sideId,
      scrollTop: document.documentElement.scrollTop || document.body.scrollTop
    }, '*');
  }, { passive: true });
})();
</script>
</body>
</html>`;
}
