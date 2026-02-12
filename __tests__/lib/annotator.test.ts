import { describe, it, expect } from 'vitest';
import { annotateContent } from '@/lib/annotator';
import type { DiffChange, ImageDetail } from '@/lib/types';

describe('annotateContent', () => {
  describe('text annotation', () => {
    it('marks equal text as migrated in source view', () => {
      const html = '<p>Hello world</p>';
      const changes: DiffChange[] = [
        { type: 'equal', value: 'Hello world' },
      ];

      const result = annotateContent(html, html, changes, [], '', '');

      expect(result.sourceHtml).toContain('class="migrated"');
      expect(result.sourceHtml).toContain('Hello');
      expect(result.sourceHtml).toContain('world');
    });

    it('marks equal text as migrated in target view', () => {
      const html = '<p>Hello world</p>';
      const changes: DiffChange[] = [
        { type: 'equal', value: 'Hello world' },
      ];

      const result = annotateContent(html, html, changes, [], '', '');

      expect(result.targetHtml).toContain('class="migrated"');
    });

    it('marks removed text as not-migrated in source view', () => {
      const sourceHtml = '<p>Old content here</p>';
      const targetHtml = '<p>New content here</p>';
      const changes: DiffChange[] = [
        { type: 'removed', value: 'Old' },
        { type: 'added', value: 'New' },
        { type: 'equal', value: ' content here' },
      ];

      const result = annotateContent(sourceHtml, targetHtml, changes, [], '', '');

      expect(result.sourceHtml).toContain('class="not-migrated"');
      expect(result.sourceHtml).toContain('Old');
      // 'added' content should NOT appear in source
      expect(result.sourceHtml).not.toContain('>New<');
    });

    it('marks added text as not-migrated in target view', () => {
      const sourceHtml = '<p>Old content</p>';
      const targetHtml = '<p>New content</p>';
      const changes: DiffChange[] = [
        { type: 'removed', value: 'Old' },
        { type: 'added', value: 'New' },
        { type: 'equal', value: ' content' },
      ];

      const result = annotateContent(sourceHtml, targetHtml, changes, [], '', '');

      expect(result.targetHtml).toContain('class="not-migrated"');
      expect(result.targetHtml).toContain('New');
      // 'removed' content should NOT appear in target
      expect(result.targetHtml).not.toContain('>Old<');
    });

    it('preserves HTML structure through annotation', () => {
      const html = '<div><h1>Title</h1><p>Paragraph with <strong>bold</strong> text</p></div>';
      const changes: DiffChange[] = [
        { type: 'equal', value: 'Title Paragraph with bold text' },
      ];

      const result = annotateContent(html, html, changes, [], '', '');

      // Should preserve structural elements (block elements get data-block-idx)
      expect(result.sourceHtml).toMatch(/<h1[^>]*>/);
      expect(result.sourceHtml).toContain('</h1>');
      expect(result.sourceHtml).toContain('<strong>');
      expect(result.sourceHtml).toContain('</strong>');
      expect(result.sourceHtml).toMatch(/<p[^>]*>/);
    });

    it('handles empty content gracefully', () => {
      const html = '';
      const changes: DiffChange[] = [];

      const result = annotateContent(html, html, changes, [], '', '');

      expect(result.sourceHtml).toContain('<!DOCTYPE html>');
      expect(result.targetHtml).toContain('<!DOCTYPE html>');
    });

    it('handles text with no diff changes', () => {
      const html = '<p>Some text</p>';
      const changes: DiffChange[] = [];

      const result = annotateContent(html, html, changes, [], '', '');

      // Text should appear but without highlight marks
      expect(result.sourceHtml).toContain('Some text');
    });

    it('handles adjacent text nodes that .text() concatenates without spaces', () => {
      // cheerio .text() on <span>Home</span><a>Excel</a> produces "HomeExcel"
      // but the DOM has separate text nodes "Home" and "Excel"
      const html = '<nav><span>Home</span></nav><h1>Excel im Berichtswesen</h1>';
      const changes: DiffChange[] = [
        { type: 'equal', value: 'HomeExcel im Berichtswesen' },
      ];

      const result = annotateContent(html, html, changes, [], '', '');

      // Both "Home" and "Excel" should be highlighted even though
      // the diff sees them as one word "HomeExcel"
      expect(result.sourceHtml).toContain('class="migrated"');
      expect(result.sourceHtml).toMatch(/Home<\/mark>/);
      expect(result.sourceHtml).toMatch(/Excel/);
    });

    it('handles extra whitespace in HTML vs normalized diff text', () => {
      const html = '<p>Hello    world</p>';
      const changes: DiffChange[] = [
        { type: 'equal', value: 'Hello world' },
      ];

      const result = annotateContent(html, html, changes, [], '', '');

      expect(result.sourceHtml).toContain('class="migrated"');
    });
  });

  describe('image annotation', () => {
    it('marks found images as img-migrated in source view', () => {
      const sourceHtml = '<div><img src="https://example.com/logo.png" alt="Logo"></div>';
      const targetHtml = '<div><img src="https://cdn.example.com/logo.png" alt="Logo"></div>';
      const imageDetails: ImageDetail[] = [
        {
          src: 'https://example.com/logo.png',
          alt: 'Logo',
          status: 'found',
          matchMethod: 'filename',
          targetMatch: 'https://cdn.example.com/logo.png',
        },
      ];

      const result = annotateContent(sourceHtml, targetHtml, [], imageDetails, '', '');

      expect(result.sourceHtml).toContain('img-migrated');
    });

    it('marks missing images as img-not-migrated in source view', () => {
      const sourceHtml = '<div><img src="https://example.com/banner.jpg" alt="Banner"></div>';
      const targetHtml = '<div></div>';
      const imageDetails: ImageDetail[] = [
        {
          src: 'https://example.com/banner.jpg',
          alt: 'Banner',
          status: 'missing',
        },
      ];

      const result = annotateContent(sourceHtml, targetHtml, [], imageDetails, '', '');

      expect(result.sourceHtml).toContain('img-not-migrated');
    });

    it('marks matched target images as img-migrated in target view', () => {
      const sourceHtml = '<div><img src="https://example.com/logo.png" alt="Logo"></div>';
      const targetHtml = '<div><img src="https://cdn.example.com/logo.png" alt="Logo"></div>';
      const imageDetails: ImageDetail[] = [
        {
          src: 'https://example.com/logo.png',
          alt: 'Logo',
          status: 'found',
          matchMethod: 'exact-url',
          targetMatch: 'https://cdn.example.com/logo.png',
        },
      ];

      const result = annotateContent(sourceHtml, targetHtml, [], imageDetails, '', '');

      expect(result.targetHtml).toContain('img-migrated');
    });

    it('marks unmatched target images as img-not-migrated in target view', () => {
      const sourceHtml = '<div></div>';
      const targetHtml = '<div><img src="https://cdn.example.com/new-banner.jpg" alt="New"></div>';
      const imageDetails: ImageDetail[] = [];

      const result = annotateContent(sourceHtml, targetHtml, [], imageDetails, '', '');

      expect(result.targetHtml).toContain('img-not-migrated');
    });
  });

  describe('HTML document wrapper', () => {
    it('wraps output in full HTML document', () => {
      const result = annotateContent('<p>Test</p>', '<p>Test</p>', [], [], '', '');

      expect(result.sourceHtml).toContain('<!DOCTYPE html>');
      expect(result.sourceHtml).toContain('<html>');
      expect(result.sourceHtml).toContain('</html>');
    });

    it('includes highlight CSS styles', () => {
      const result = annotateContent('<p>Test</p>', '<p>Test</p>', [], [], '', '');

      expect(result.sourceHtml).toContain('<style>');
      expect(result.sourceHtml).toContain('mark.migrated');
      expect(result.sourceHtml).toContain('mark.not-migrated');
      expect(result.sourceHtml).toContain('img-migrated');
      expect(result.sourceHtml).toContain('img-not-migrated');
      expect(result.sourceHtml).toContain('show-migrated');
      expect(result.sourceHtml).toContain('show-not-migrated');
    });

    it('includes postMessage toggle script', () => {
      const result = annotateContent('<p>Test</p>', '<p>Test</p>', [], [], '', '');

      expect(result.sourceHtml).toContain('window.addEventListener');
      expect(result.sourceHtml).toContain('toggle-highlight');
    });

    it('sets default highlight body class based on side', () => {
      const result = annotateContent('<p>Test</p>', '<p>Test</p>', [], [], '', '');

      // Source defaults to not-migrated (red), target defaults to migrated (green)
      expect(result.sourceHtml).toContain('<body class="show-not-migrated">');
      expect(result.targetHtml).toContain('<body class="show-migrated">');
    });
  });

  describe('moved content detection', () => {
    it('marks removed text as migrated if it exists in target text', () => {
      const sourceHtml = '<p>Author Name</p><p>Some content</p>';
      const targetHtml = '<p>Some content</p><p>Author Name</p>';
      const changes: DiffChange[] = [
        { type: 'removed', value: 'Author Name\n\n' },
        { type: 'equal', value: 'Some content' },
      ];
      const sourceText = 'Author Name\n\nSome content';
      const targetText = 'Some content\n\nAuthor Name';

      const result = annotateContent(sourceHtml, targetHtml, changes, [], sourceText, targetText);

      // "Author Name" is removed in the diff but exists in target text,
      // so it should be marked as migrated+moved rather than not-migrated
      expect(result.sourceHtml).toContain('<mark class="migrated moved">Author Name</mark>');
      // Only text highlights — no not-migrated marks expected
      expect(result.sourceHtml).not.toMatch(/<mark class="not-migrated">/);

    });

    it('marks added text as migrated if it exists in source text', () => {
      const sourceHtml = '<p>Some content</p>';
      const targetHtml = '<p>Author Name</p><p>Some content</p>';
      const changes: DiffChange[] = [
        { type: 'added', value: 'Author Name\n\n' },
        { type: 'equal', value: 'Some content' },
      ];
      const sourceText = 'Author Name\n\nSome content';
      const targetText = 'Author Name\n\nSome content';

      const result = annotateContent(sourceHtml, targetHtml, changes, [], sourceText, targetText);

      // "Author Name" is added in the diff but exists in source text,
      // so it should be marked as migrated+moved in the target view
      expect(result.targetHtml).toContain('<mark class="migrated moved">Author Name</mark>');
    });

    it('does not mark short single words as moved', () => {
      const sourceHtml = '<p>Old text</p>';
      const targetHtml = '<p>New text</p>';
      const changes: DiffChange[] = [
        { type: 'removed', value: 'Old' },
        { type: 'added', value: 'New' },
        { type: 'equal', value: ' text' },
      ];
      // "Old" is a short word — even if it appears on the target,
      // it shouldn't be considered moved content
      const sourceText = 'Old text';
      const targetText = 'New text Old reference';

      const result = annotateContent(sourceHtml, targetHtml, changes, [], sourceText, targetText);

      expect(result.sourceHtml).toContain('class="not-migrated"');
    });

    it('handles mixed moved and genuinely removed content in one change', () => {
      const sourceHtml = '<p>Category Info</p><p>Author Name</p>';
      const targetHtml = '<p>Author Name</p>';
      const changes: DiffChange[] = [
        { type: 'removed', value: 'Category Info\n\nAuthor Name' },
      ];
      const sourceText = 'Category Info\n\nAuthor Name';
      const targetText = 'Author Name';

      const result = annotateContent(sourceHtml, targetHtml, changes, [], sourceText, targetText);

      // "Category Info" is genuinely removed — not in target
      // "Author Name" is moved — exists in target
      expect(result.sourceHtml).toContain('<mark class="not-migrated">Category Info</mark>');
      expect(result.sourceHtml).toContain('<mark class="migrated moved">Author Name</mark>');
    });
  });

  describe('security', () => {
    it('HTML-escapes text content in mark tags', () => {
      const html = '<p>&lt;script&gt;alert("xss")&lt;/script&gt;</p>';
      const changes: DiffChange[] = [
        { type: 'equal', value: '<script>alert("xss")</script>' },
      ];

      const result = annotateContent(html, html, changes, [], '', '');

      // Should not contain unescaped script tags in the mark elements
      expect(result.sourceHtml).not.toMatch(/<mark[^>]*><script>/);
    });
  });
});
