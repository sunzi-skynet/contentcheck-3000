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

  it('extracts lazy-loaded images via data-lazy-src', () => {
    const html = `
      <html><body><main>
        <img src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20993%20512'%3E%3C/svg%3E"
             data-lazy-src="https://example.com/wp-content/uploads/image.jpg"
             alt="Lazy image">
      </main></body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].src).toBe('https://example.com/wp-content/uploads/image.jpg');
    expect(result.images[0].alt).toBe('Lazy image');
  });

  it('extracts lazy-loaded images via data-src', () => {
    const html = `
      <html><body><main>
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
             data-src="/images/photo.jpg"
             alt="Generic lazy">
      </main></body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].src).toBe('https://example.com/images/photo.jpg');
  });

  it('prefers real src over data-lazy-src when src is not a data URI', () => {
    const html = `
      <html><body><main>
        <img src="/images/real.jpg"
             data-lazy-src="/images/lazy.jpg"
             alt="Real src">
      </main></body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].src).toBe('https://example.com/images/real.jpg');
  });

  it('skips images with only data URI and no lazy-load fallback', () => {
    const html = `
      <html><body><main>
        <img src="data:image/svg+xml,placeholder" alt="No fallback">
      </main></body></html>`;
    const result = extractContent(html, BASE_URL);
    expect(result.images).toHaveLength(0);
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

  describe('includeSelectors', () => {
    it('keeps only elements matching include selectors', () => {
      const html = `
        <html><body><main>
          <div class="intro">Introduction</div>
          <div class="article-body">Article content here</div>
          <div class="sidebar">Sidebar stuff</div>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        includeSelectors: ['.article-body'],
      });
      expect(result.text).toContain('Article content here');
      expect(result.text).not.toContain('Introduction');
      expect(result.text).not.toContain('Sidebar stuff');
    });

    it('supports multiple include selectors (OR logic)', () => {
      const html = `
        <html><body><main>
          <div class="intro">Introduction</div>
          <div class="article-body">Article content</div>
          <div class="summary">Summary text</div>
          <div class="sidebar">Sidebar stuff</div>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        includeSelectors: ['.article-body', '.summary'],
      });
      expect(result.text).toContain('Article content');
      expect(result.text).toContain('Summary text');
      expect(result.text).not.toContain('Introduction');
      expect(result.text).not.toContain('Sidebar stuff');
    });

    it('works with auto-detected content root', () => {
      const html = `
        <html><body>
          <nav>Navigation</nav>
          <main>
            <div class="hero">Hero banner</div>
            <div class="content">Main content</div>
          </main>
          <footer>Footer</footer>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        includeSelectors: ['.content'],
      });
      expect(result.text).toContain('Main content');
      expect(result.text).not.toContain('Hero banner');
      expect(result.text).not.toContain('Navigation');
    });

    it('works with custom selector + include', () => {
      const html = `
        <html><body>
          <div id="wrapper">
            <div class="keep">Keep this</div>
            <div class="drop">Drop this</div>
          </div>
        </body></html>`;
      const result = extractContent(html, BASE_URL, {
        customSelector: '#wrapper',
        includeSelectors: ['.keep'],
      });
      expect(result.text).toContain('Keep this');
      expect(result.text).not.toContain('Drop this');
    });

    it('empty includeSelectors array has no effect', () => {
      const html = `
        <html><body><main>
          <p>All content</p>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        includeSelectors: [],
      });
      expect(result.text).toContain('All content');
    });

    it('filters images when include selectors are active', () => {
      const html = `
        <html><body><main>
          <div class="content">
            <img src="/included.jpg" alt="Included">
            <p>Text</p>
          </div>
          <div class="sidebar">
            <img src="/excluded.jpg" alt="Excluded">
          </div>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        includeSelectors: ['.content'],
      });
      expect(result.images).toHaveLength(1);
      expect(result.images[0].alt).toBe('Included');
    });
  });

  describe('excludeSelectors', () => {
    it('removes elements matching exclude selectors', () => {
      const html = `
        <html><body><main>
          <div class="article-body">Article content</div>
          <div class="author-bio">Author bio</div>
          <div class="related">Related articles</div>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        excludeSelectors: ['.author-bio', '.related'],
      });
      expect(result.text).toContain('Article content');
      expect(result.text).not.toContain('Author bio');
      expect(result.text).not.toContain('Related articles');
    });

    it('works with body fallback', () => {
      const html = `
        <html><body>
          <div class="content">Body content</div>
          <div class="ad-slot">Advertisement</div>
        </body></html>`;
      const result = extractContent(html, BASE_URL, {
        excludeSelectors: ['.ad-slot'],
      });
      expect(result.text).toContain('Body content');
      expect(result.text).not.toContain('Advertisement');
    });

    it('empty excludeSelectors array has no effect', () => {
      const html = `
        <html><body><main>
          <p>All content</p>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        excludeSelectors: [],
      });
      expect(result.text).toContain('All content');
    });

    it('filters images when exclude selectors are active', () => {
      const html = `
        <html><body><main>
          <div class="content">
            <img src="/keep.jpg" alt="Keep">
          </div>
          <div class="gallery">
            <img src="/remove.jpg" alt="Remove">
          </div>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        excludeSelectors: ['.gallery'],
      });
      expect(result.images).toHaveLength(1);
      expect(result.images[0].alt).toBe('Keep');
    });
  });

  describe('includeSelectors + excludeSelectors combined', () => {
    it('applies include first, then exclude within included content', () => {
      const html = `
        <html><body><main>
          <div class="article">
            <p>Article text</p>
            <div class="ad">Ad inside article</div>
          </div>
          <div class="sidebar">Sidebar</div>
        </main></body></html>`;
      const result = extractContent(html, BASE_URL, {
        includeSelectors: ['.article'],
        excludeSelectors: ['.ad'],
      });
      expect(result.text).toContain('Article text');
      expect(result.text).not.toContain('Ad inside article');
      expect(result.text).not.toContain('Sidebar');
    });
  });
});
