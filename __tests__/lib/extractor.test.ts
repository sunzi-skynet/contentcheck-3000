import { describe, it, expect } from 'vitest';
import { extractContent } from '@/lib/extractor';

const BASE_URL = 'https://example.com/page';

describe('extractContent', () => {
  it('extracts title from <title> tag', () => {
    const html = '<html><head><title>Test Page</title></head><body><main>Content</main></body></html>';
    const result = extractContent(html, BASE_URL);
    expect(result.title).toBe('Test Page');
  });

  it('uses <main> tag as primary content container', () => {
    const html = `
      <html><body>
        <nav>Navigation</nav>
        <main>Main content here</main>
        <footer>Footer</footer>
      </body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.text).toBe('Main content here');
  });

  it('falls back to <article> when no <main>', () => {
    const html = `
      <html><body>
        <nav>Navigation</nav>
        <article>Article content</article>
        <footer>Footer</footer>
      </body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.text).toBe('Article content');
  });

  it('falls back to [role="main"]', () => {
    const html = `
      <html><body>
        <nav>Navigation</nav>
        <div role="main">Role main content</div>
      </body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.text).toBe('Role main content');
  });

  it('falls back to CMS containers like #content', () => {
    const html = `
      <html><body>
        <nav>Navigation</nav>
        <div id="content">CMS content here</div>
      </body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.text).toBe('CMS content here');
  });

  it('strips nav/header/footer when falling back to body', () => {
    const html = `
      <html><body>
        <nav>Navigation</nav>
        <header>Header</header>
        <div>Body content</div>
        <footer>Footer</footer>
      </body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.text).toContain('Body content');
    expect(result.text).not.toContain('Navigation');
    expect(result.text).not.toContain('Footer');
  });

  it('extracts images with absolute URLs', () => {
    const html = `
      <html><body><main>
        <img src="/images/logo.png" alt="Logo">
        <img src="https://cdn.example.com/banner.jpg" alt="Banner">
      </main></body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.images).toHaveLength(2);
    expect(result.images[0].src).toBe('https://example.com/images/logo.png');
    expect(result.images[0].alt).toBe('Logo');
    expect(result.images[1].src).toBe('https://cdn.example.com/banner.jpg');
  });

  it('deduplicates images by src', () => {
    const html = `
      <html><body><main>
        <img src="/logo.png" alt="Logo">
        <img src="/logo.png" alt="Logo again">
      </main></body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.images).toHaveLength(1);
  });

  it('uses custom selector when provided', () => {
    const html = `
      <html><body>
        <main>Main content</main>
        <div class="custom-area">Custom area content</div>
      </body></html>`;
    const result = extractContent(html, BASE_URL, '.custom-area');
    expect(result.text).toBe('Custom area content');
  });

  it('throws on unsafe custom selector', () => {
    const html = '<html><body><div>Content</div></body></html>';
    expect(() => extractContent(html, BASE_URL, '[data-x]')).toThrow('Unsafe CSS selector');
  });

  it('throws when custom selector matches nothing', () => {
    const html = '<html><body><div>Content</div></body></html>';
    expect(() => extractContent(html, BASE_URL, '.nonexistent')).toThrow('matched no elements');
  });

  it('extracts picture source elements', () => {
    const html = `
      <html><body><main>
        <picture>
          <source srcset="/images/hero-large.webp 1024w, /images/hero-small.webp 480w">
          <img src="/images/hero.jpg" alt="Hero">
        </picture>
      </main></body></html>`;
    const result = extractContent(html, BASE_URL);
    // Should get both the source srcset (first URL) and the img
    expect(result.images.length).toBeGreaterThanOrEqual(2);
  });
});
