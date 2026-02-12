/**
 * Integration test: annotator → block tagging → isShared → computeAlignment
 *
 * Runs the full server-side chain without a browser:
 * 1. Create source/target HTML with known content
 * 2. Diff the text
 * 3. Annotate via annotateContent()
 * 4. Parse annotated HTML with cheerio (simulating iframe measure-blocks)
 * 5. Feed measurements into computeAlignment()
 * 6. Assert spacers are correct
 */
import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { annotateContent } from '../../src/lib/annotator';
import { computeDiff } from '../../src/lib/differ';
import { computeAlignment } from '../../src/lib/alignment';
import type { BlockMeasurement } from '../../src/lib/alignment';
import type { DiffChange, ImageDetail } from '../../src/lib/types';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Simulate the iframe's measure-blocks logic: extract data-block-idx elements,
 * determine isShared from migrated vs not-migrated mark char counts.
 * Uses cumulative height as a proxy for "top" since we can't getBoundingClientRect.
 */
function simulateMeasureBlocks($: cheerio.CheerioAPI): BlockMeasurement[] {
  const measurements: BlockMeasurement[] = [];
  const blocks = $('[data-block-idx]');

  blocks.each((_, el) => {
    const $el = $(el);
    const idx = parseInt($el.attr('data-block-idx')!, 10);

    // Count migrated vs not-migrated characters (mirrors iframe script logic)
    let migratedChars = 0;
    let notMigratedChars = 0;

    $el.find('mark').each((__, mark) => {
      const $mark = $(mark);
      const txt = $mark.text();
      // Mirror iframe logic: exclude moved content from shared detection
      if ($mark.hasClass('migrated') && !$mark.hasClass('moved')) migratedChars += txt.length;
      if ($mark.hasClass('not-migrated')) notMigratedChars += txt.length;
    });

    // For images
    const tagName = (el as unknown as { tagName: string }).tagName?.toLowerCase();
    if (tagName === 'img') {
      if ($el.hasClass('img-migrated')) migratedChars = 1;
      if ($el.hasClass('img-not-migrated')) notMigratedChars = 1;
    }

    const isShared = migratedChars >= notMigratedChars && migratedChars > 0;
    const text = $el.text().trim().slice(0, 200);

    measurements.push({ idx, top: 0, height: 0, isShared, text });
  });

  return measurements;
}

/**
 * Assign simulated top/height to measurements.
 * Uses a fixed height per block and accumulates top positions,
 * giving us realistic-ish layout without a browser.
 */
function assignSimulatedPositions(
  measurements: BlockMeasurement[],
  heightPerBlock = 50
): BlockMeasurement[] {
  let top = 0;
  return measurements.map(m => {
    const result = { ...m, top, height: heightPerBlock };
    top += heightPerBlock + 10; // 10px gap between blocks
    return result;
  });
}

/**
 * Check that spacer divs exist and correspond to block indices.
 */
function getSpacerIndices($: cheerio.CheerioAPI): number[] {
  const indices: number[] = [];
  $('.sync-spacer[data-spacer]').each((_, el) => {
    indices.push(parseInt($(el).attr('data-spacer')!, 10));
  });
  return indices;
}

/**
 * Extract the text content of each tagged block.
 */
function getBlockTexts($: cheerio.CheerioAPI): { idx: number; text: string }[] {
  const result: { idx: number; text: string }[] = [];
  $('[data-block-idx]').each((_, el) => {
    result.push({
      idx: parseInt($(el).attr('data-block-idx')!, 10),
      text: $(el).text().trim(),
    });
  });
  return result;
}

// ── Diagnostic printer ─────────────────────────────────────────────────

function printDiagnostics(
  label: string,
  $: cheerio.CheerioAPI,
  measurements: BlockMeasurement[]
) {
  console.log(`\n=== ${label} ===`);
  const blocks = getBlockTexts($);
  console.log(`  Blocks tagged: ${blocks.length}`);
  for (const b of blocks) {
    const m = measurements.find(x => x.idx === b.idx);
    console.log(`  [${b.idx}] isShared=${m?.isShared ?? '?'} "${b.text.slice(0, 60)}"`);
  }
  const spacers = getSpacerIndices($);
  console.log(`  Spacer divs: ${spacers.length} (indices: ${spacers.join(', ')})`);
}

// ── Test data ──────────────────────────────────────────────────────────

/** Two pages with mostly shared content but some differences */
const SOURCE_HTML = `
<div>
  <h1>Welcome to Our Blog</h1>
  <p>This is the introduction paragraph that appears on both pages.</p>
  <p>This paragraph only exists on the source page and was removed during migration.</p>
  <p>Here is another shared paragraph with important content.</p>
  <h2>Section Two</h2>
  <p>The final paragraph is shared between both pages.</p>
</div>`;

const TARGET_HTML = `
<div>
  <h1>Welcome to Our Blog</h1>
  <p>This is the introduction paragraph that appears on both pages.</p>
  <p>This new paragraph was added during the migration process.</p>
  <p>Here is another shared paragraph with important content.</p>
  <h2>Section Two</h2>
  <p>The final paragraph is shared between both pages.</p>
</div>`;

const SOURCE_TEXT = `Welcome to Our Blog
This is the introduction paragraph that appears on both pages.
This paragraph only exists on the source page and was removed during migration.
Here is another shared paragraph with important content.
Section Two
The final paragraph is shared between both pages.`;

const TARGET_TEXT = `Welcome to Our Blog
This is the introduction paragraph that appears on both pages.
This new paragraph was added during the migration process.
Here is another shared paragraph with important content.
Section Two
The final paragraph is shared between both pages.`;

// ── Tests ──────────────────────────────────────────────────────────────

describe('Alignment integration: annotator → blocks → isShared → computeAlignment', () => {

  it('tags block elements with data-block-idx in annotated HTML', () => {
    const diff = computeDiff(SOURCE_TEXT, TARGET_TEXT);
    const annotated = annotateContent(
      SOURCE_HTML, TARGET_HTML, diff.changes, [], SOURCE_TEXT, TARGET_TEXT
    );

    const $source = cheerio.load(annotated.sourceHtml);
    const $target = cheerio.load(annotated.targetHtml);

    const sourceBlocks = getBlockTexts($source);
    const targetBlocks = getBlockTexts($target);

    console.log('Source blocks:', sourceBlocks.map(b => `[${b.idx}] "${b.text.slice(0, 50)}"`));
    console.log('Target blocks:', targetBlocks.map(b => `[${b.idx}] "${b.text.slice(0, 50)}"`));

    expect(sourceBlocks.length).toBeGreaterThan(0);
    expect(targetBlocks.length).toBeGreaterThan(0);
  });

  it('inserts sync-spacer divs before each block', () => {
    const diff = computeDiff(SOURCE_TEXT, TARGET_TEXT);
    const annotated = annotateContent(
      SOURCE_HTML, TARGET_HTML, diff.changes, [], SOURCE_TEXT, TARGET_TEXT
    );

    const $source = cheerio.load(annotated.sourceHtml);
    const $target = cheerio.load(annotated.targetHtml);

    const sourceBlockCount = $source('[data-block-idx]').length;
    const targetBlockCount = $target('[data-block-idx]').length;
    const sourceSpacerCount = $source('.sync-spacer[data-spacer]').length;
    const targetSpacerCount = $target('.sync-spacer[data-spacer]').length;

    expect(sourceSpacerCount).toBe(sourceBlockCount);
    expect(targetSpacerCount).toBe(targetBlockCount);
  });

  it('spacer div immediately precedes its corresponding block', () => {
    const diff = computeDiff(SOURCE_TEXT, TARGET_TEXT);
    const annotated = annotateContent(
      SOURCE_HTML, TARGET_HTML, diff.changes, [], SOURCE_TEXT, TARGET_TEXT
    );

    const $ = cheerio.load(annotated.sourceHtml);
    $('[data-block-idx]').each((_, el) => {
      const idx = $(el).attr('data-block-idx');
      const prev = $(el).prev();
      expect(prev.hasClass('sync-spacer')).toBe(true);
      expect(prev.attr('data-spacer')).toBe(idx);
    });
  });

  it('correctly determines isShared for shared vs unique blocks', () => {
    const diff = computeDiff(SOURCE_TEXT, TARGET_TEXT);
    const annotated = annotateContent(
      SOURCE_HTML, TARGET_HTML, diff.changes, [], SOURCE_TEXT, TARGET_TEXT
    );

    const $source = cheerio.load(annotated.sourceHtml);
    const $target = cheerio.load(annotated.targetHtml);

    const sourceMeasurements = simulateMeasureBlocks($source);
    const targetMeasurements = simulateMeasureBlocks($target);

    printDiagnostics('Source', $source, sourceMeasurements);
    printDiagnostics('Target', $target, targetMeasurements);

    const sourceSharedCount = sourceMeasurements.filter(m => m.isShared).length;
    const targetSharedCount = targetMeasurements.filter(m => m.isShared).length;

    console.log(`\nSource: ${sourceSharedCount}/${sourceMeasurements.length} shared`);
    console.log(`Target: ${targetSharedCount}/${targetMeasurements.length} shared`);

    // With mostly shared content, we expect multiple shared blocks on each side
    expect(sourceSharedCount).toBeGreaterThan(0);
    expect(targetSharedCount).toBeGreaterThan(0);
  });

  it('produces non-trivial spacers when sides have different block counts', () => {
    // Use HTML where source has an extra paragraph → different positions
    const sourceExtra = `
    <div>
      <h1>Title</h1>
      <p>Shared paragraph one.</p>
      <p>Extra source-only paragraph that was removed.</p>
      <p>Shared paragraph two.</p>
    </div>`;

    const targetExtra = `
    <div>
      <h1>Title</h1>
      <p>Shared paragraph one.</p>
      <p>Shared paragraph two.</p>
    </div>`;

    const srcText = 'Title\nShared paragraph one.\nExtra source-only paragraph that was removed.\nShared paragraph two.';
    const tgtText = 'Title\nShared paragraph one.\nShared paragraph two.';

    const diff = computeDiff(srcText, tgtText);
    const annotated = annotateContent(
      sourceExtra, targetExtra, diff.changes, [], srcText, tgtText
    );

    const $source = cheerio.load(annotated.sourceHtml);
    const $target = cheerio.load(annotated.targetHtml);

    const sourceMeasurements = assignSimulatedPositions(simulateMeasureBlocks($source));
    const targetMeasurements = assignSimulatedPositions(simulateMeasureBlocks($target));

    printDiagnostics('Source (extra block)', $source, sourceMeasurements);
    printDiagnostics('Target (extra block)', $target, targetMeasurements);

    const alignment = computeAlignment(sourceMeasurements, targetMeasurements);

    console.log('\nComputed alignment:');
    console.log('  sourceSpacers:', alignment.sourceSpacers);
    console.log('  targetSpacers:', alignment.targetSpacers);

    // Source has an extra block, so target should need at least one spacer
    // to push its later shared blocks down
    const totalSpacerHeight =
      Object.values(alignment.sourceSpacers).reduce((a, b) => a + b, 0) +
      Object.values(alignment.targetSpacers).reduce((a, b) => a + b, 0);

    expect(totalSpacerHeight).toBeGreaterThan(0);
  });

  it('shared block count matches between source and target for identical content', () => {
    const html = `
    <div>
      <h1>Same Title</h1>
      <p>Same paragraph.</p>
    </div>`;
    const text = 'Same Title\nSame paragraph.';

    const diff = computeDiff(text, text);
    const annotated = annotateContent(html, html, diff.changes, [], text, text);

    const $source = cheerio.load(annotated.sourceHtml);
    const $target = cheerio.load(annotated.targetHtml);

    const sourceMeasurements = simulateMeasureBlocks($source);
    const targetMeasurements = simulateMeasureBlocks($target);

    const sourceShared = sourceMeasurements.filter(m => m.isShared).length;
    const targetShared = targetMeasurements.filter(m => m.isShared).length;

    printDiagnostics('Source (identical)', $source, sourceMeasurements);
    printDiagnostics('Target (identical)', $target, targetMeasurements);

    // Identical content: all blocks should be shared, counts should match
    expect(sourceShared).toBe(sourceMeasurements.length);
    expect(targetShared).toBe(targetMeasurements.length);
    expect(sourceShared).toBe(targetShared);
  });

  it('alignment produces zero spacers when content is identical', () => {
    const html = `
    <div>
      <h1>Same Title</h1>
      <p>Same paragraph one.</p>
      <p>Same paragraph two.</p>
    </div>`;
    const text = 'Same Title\nSame paragraph one.\nSame paragraph two.';

    const diff = computeDiff(text, text);
    const annotated = annotateContent(html, html, diff.changes, [], text, text);

    const $source = cheerio.load(annotated.sourceHtml);
    const $target = cheerio.load(annotated.targetHtml);

    // Same HTML → same layout → same positions
    const sourceMeasurements = assignSimulatedPositions(simulateMeasureBlocks($source));
    const targetMeasurements = assignSimulatedPositions(simulateMeasureBlocks($target));

    const alignment = computeAlignment(sourceMeasurements, targetMeasurements);

    expect(Object.keys(alignment.sourceSpacers)).toHaveLength(0);
    expect(Object.keys(alignment.targetSpacers)).toHaveLength(0);
  });

  it('diagnoses the real-world pattern: blocks with mixed migrated/not-migrated marks', () => {
    // A paragraph that is partially changed — some words match, some don't
    const sourceHtml = `
    <div>
      <h1>Blog Post Title</h1>
      <p>The quick brown fox jumps over the lazy dog in the garden.</p>
      <p>This entire paragraph was rewritten for the new site.</p>
      <p>Final shared paragraph remains unchanged.</p>
    </div>`;

    const targetHtml = `
    <div>
      <h1>Blog Post Title</h1>
      <p>The quick brown fox jumps over the lazy dog in the garden.</p>
      <p>A completely new paragraph replaced the old one here.</p>
      <p>Final shared paragraph remains unchanged.</p>
    </div>`;

    const srcText = 'Blog Post Title\nThe quick brown fox jumps over the lazy dog in the garden.\nThis entire paragraph was rewritten for the new site.\nFinal shared paragraph remains unchanged.';
    const tgtText = 'Blog Post Title\nThe quick brown fox jumps over the lazy dog in the garden.\nA completely new paragraph replaced the old one here.\nFinal shared paragraph remains unchanged.';

    const diff = computeDiff(srcText, tgtText);
    const annotated = annotateContent(
      sourceHtml, targetHtml, diff.changes, [], srcText, tgtText
    );

    const $source = cheerio.load(annotated.sourceHtml);
    const $target = cheerio.load(annotated.targetHtml);

    const sourceMeasurements = simulateMeasureBlocks($source);
    const targetMeasurements = simulateMeasureBlocks($target);

    printDiagnostics('Source (mixed)', $source, sourceMeasurements);
    printDiagnostics('Target (mixed)', $target, targetMeasurements);

    // Log per-block migrated/not-migrated/moved character counts for diagnosis
    console.log('\nPer-block character breakdown:');
    for (const side of ['source', 'target'] as const) {
      const $ = side === 'source' ? $source : $target;
      console.log(`  ${side}:`);
      $('[data-block-idx]').each((_, el) => {
        const $el = $(el);
        const idx = $el.attr('data-block-idx');
        let mc = 0, nmc = 0, movedC = 0;
        $el.find('mark.migrated:not(.moved)').each((__, m) => { mc += $(m).text().length; });
        $el.find('mark.migrated.moved').each((__, m) => { movedC += $(m).text().length; });
        $el.find('mark.not-migrated').each((__, m) => { nmc += $(m).text().length; });
        const total = mc + nmc + movedC;
        const shared = mc >= nmc && mc > 0;
        console.log(`    [${idx}] migrated=${mc} moved=${movedC} not-migrated=${nmc} total=${total} → isShared=${shared} "${$el.text().trim().slice(0, 40)}"`);
      });
    }

    // Blocks 0 (h1), 1 (shared p), 3 (shared p) should be shared
    // Block 2 (rewritten p) should NOT be shared
    const sourceShared = sourceMeasurements.filter(m => m.isShared);
    const targetShared = targetMeasurements.filter(m => m.isShared);

    expect(sourceShared.length).toBeGreaterThanOrEqual(3);
    expect(targetShared.length).toBeGreaterThanOrEqual(3);
  });

  it('moved content blocks are NOT marked as shared for alignment', () => {
    // Source has paragraphs A, B, C. Target has paragraphs A, C, B (B and C swapped).
    // B and C are "moved" — they exist on both sides but at different positions.
    // For alignment, moved blocks should NOT be shared anchors.
    const sourceHtml = `
    <div>
      <h1>Page Title</h1>
      <p>First paragraph is identical on both pages and stays in place.</p>
      <p>Second paragraph about database optimization techniques and best practices for production.</p>
      <p>Third paragraph about frontend performance monitoring and user experience metrics.</p>
    </div>`;

    const targetHtml = `
    <div>
      <h1>Page Title</h1>
      <p>First paragraph is identical on both pages and stays in place.</p>
      <p>Third paragraph about frontend performance monitoring and user experience metrics.</p>
      <p>Second paragraph about database optimization techniques and best practices for production.</p>
    </div>`;

    const srcText = 'Page Title\nFirst paragraph is identical on both pages and stays in place.\nSecond paragraph about database optimization techniques and best practices for production.\nThird paragraph about frontend performance monitoring and user experience metrics.';
    const tgtText = 'Page Title\nFirst paragraph is identical on both pages and stays in place.\nThird paragraph about frontend performance monitoring and user experience metrics.\nSecond paragraph about database optimization techniques and best practices for production.';

    const diff = computeDiff(srcText, tgtText);
    const annotated = annotateContent(
      sourceHtml, targetHtml, diff.changes, [], srcText, tgtText
    );

    const $source = cheerio.load(annotated.sourceHtml);
    const $target = cheerio.load(annotated.targetHtml);

    const sourceMeasurements = simulateMeasureBlocks($source);
    const targetMeasurements = simulateMeasureBlocks($target);

    printDiagnostics('Source (moved)', $source, sourceMeasurements);
    printDiagnostics('Target (moved)', $target, targetMeasurements);

    // Log moved marks specifically
    console.log('\nMoved content per block:');
    for (const side of ['source', 'target'] as const) {
      const $ = side === 'source' ? $source : $target;
      console.log(`  ${side}:`);
      $('[data-block-idx]').each((_, el) => {
        const $el = $(el);
        const idx = $el.attr('data-block-idx');
        const movedMarks = $el.find('mark.moved');
        const movedText = movedMarks.text();
        console.log(`    [${idx}] moved chars=${movedText.length} "${$el.text().trim().slice(0, 50)}"`);
      });
    }

    // Title and first paragraph should be shared (in-place match)
    // The swapped paragraphs should NOT be shared — they're moved content
    const sourceShared = sourceMeasurements.filter(m => m.isShared);
    const targetShared = targetMeasurements.filter(m => m.isShared);

    console.log(`\nSource shared: ${sourceShared.length}/${sourceMeasurements.length}`);
    console.log(`Target shared: ${targetShared.length}/${targetMeasurements.length}`);

    // At minimum, title + first paragraph should be shared on both sides
    expect(sourceShared.length).toBeGreaterThanOrEqual(2);
    expect(targetShared.length).toBeGreaterThanOrEqual(2);

    // The shared count should be EQUAL on both sides (alignment requires 1:1 matching)
    // and should be LESS than total blocks (moved blocks excluded)
    expect(sourceShared.length).toBe(targetShared.length);
    expect(sourceShared.length).toBeLessThan(sourceMeasurements.length);
  });
});
