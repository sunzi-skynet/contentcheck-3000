/**
 * Integration test: compares a real Diamant Software blog page
 * against its Storyblok migration target.
 *
 * These tests hit live URLs and require network access.
 * They are slower than unit tests and may fail if the sites change.
 * Run with: npx vitest run __tests__/integration/
 */
import { describe, it, expect } from 'vitest';
import { fetchPage } from '@/lib/fetcher';
import { extractContent } from '@/lib/extractor';
import { computeDiff } from '@/lib/differ';
import { checkImages } from '@/lib/image-checker';
import { annotateContent } from '@/lib/annotator';

const SOURCE_URL = 'https://www.diamant-software.de/blog/excel-im-berichtswesen/';
const TARGET_URL = 'https://diamant-storyblok.vercel.app/blog/excel-im-berichtswesen';
const TARGET_AUTH = { username: 'sunzinet', password: 'sunzinet2025!' };

describe('Diamant blog migration: excel-im-berichtswesen', () => {
  let sourceHtml: string;
  let targetHtml: string;

  it('fetches source and target pages', async () => {
    [sourceHtml, targetHtml] = await Promise.all([
      fetchPage(SOURCE_URL),
      fetchPage(TARGET_URL, TARGET_AUTH),
    ]);

    expect(sourceHtml.length).toBeGreaterThan(1000);
    expect(targetHtml.length).toBeGreaterThan(1000);
  }, 30_000);

  it('extracts content with HTML from both pages', () => {
    const sourceExtraction = extractContent(sourceHtml, SOURCE_URL);
    const targetExtraction = extractContent(targetHtml, TARGET_URL);

    // Both should have meaningful text
    expect(sourceExtraction.text.length).toBeGreaterThan(100);
    expect(targetExtraction.text.length).toBeGreaterThan(100);

    // Both should have contentHtml
    expect(sourceExtraction.contentHtml.length).toBeGreaterThan(100);
    expect(targetExtraction.contentHtml.length).toBeGreaterThan(100);

    // Source should have images (blog post with illustrations)
    expect(sourceExtraction.images.length).toBeGreaterThan(0);
  });

  it('computes diff with reasonable similarity', () => {
    const sourceExtraction = extractContent(sourceHtml, SOURCE_URL);
    const targetExtraction = extractContent(targetHtml, TARGET_URL);
    const diff = computeDiff(sourceExtraction.text, targetExtraction.text);

    // Migration of the same blog post should have decent similarity
    expect(diff.similarity).toBeGreaterThan(50);
    expect(diff.changes.length).toBeGreaterThan(0);

    // Should have some equal (migrated) content
    const equalChanges = diff.changes.filter(c => c.type === 'equal');
    expect(equalChanges.length).toBeGreaterThan(0);
  });

  it('produces annotated HTML with highlight marks', async () => {
    const sourceExtraction = extractContent(sourceHtml, SOURCE_URL);
    const targetExtraction = extractContent(targetHtml, TARGET_URL);
    const diff = computeDiff(sourceExtraction.text, targetExtraction.text);
    const imageReport = await checkImages(
      sourceExtraction.images,
      targetExtraction.images
    );

    const annotated = annotateContent(
      sourceExtraction.contentHtml,
      targetExtraction.contentHtml,
      diff.changes,
      imageReport.details,
      sourceExtraction.text,
      targetExtraction.text
    );

    // Source annotated HTML
    expect(annotated.sourceHtml).toContain('<!DOCTYPE html>');
    expect(annotated.sourceHtml).toContain('class="migrated"');
    expect(annotated.sourceHtml).toContain('class="not-migrated"');
    expect(annotated.sourceHtml).toContain('show-migrated');
    expect(annotated.sourceHtml).toContain('toggle-highlight');

    // Target annotated HTML
    expect(annotated.targetHtml).toContain('<!DOCTYPE html>');
    expect(annotated.targetHtml).toContain('class="migrated"');

    // Both should have substantial content
    expect(annotated.sourceHtml.length).toBeGreaterThan(5000);
    expect(annotated.targetHtml.length).toBeGreaterThan(5000);
  }, 30_000);
});
