# ContentCheck 3000

Compare source and target pages during website migrations to verify that text and images were migrated correctly.

**Live:** [contentcheck-3000.vercel.app](https://contentcheck-3000.vercel.app)

## What it does

During CMS-to-CMS migrations, the content (text and images) must survive even though the design, navigation, and layout change. ContentCheck 3000 extracts the main content from both pages and produces:

- **Text diff** with word-level highlighting and similarity score
- **Image presence report** — which source images were found on the target (matched by URL, filename, content hash, or alt text)
- **Visual preview** — side-by-side annotated HTML previews with sync scroll, showing migrated vs. missing content
- **Overall migration score** (weighted: 70% text, 30% images)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter a source URL and target URL, and hit Compare.

## How it works

All processing runs server-side. No content is stored permanently.

```
User submits URLs → POST /api/compare
  → url-validator    (validate scheme, resolve DNS, block private IPs — SSRF protection)
  → fetcher          (fetch HTML, streaming body with 5 MB cap, encoding detection)
  → extractor        (cheerio → extract main content text + images)
  → differ           (word-level text diff + similarity %)
  → image-checker    (layered matching: URL → filename → content hash → alt text)
  → annotator        (HTML annotation for visual preview with highlight classes)
  → response
```

### Content extraction strategy

The extractor auto-detects the main content area using a priority-based fallback:

1. `<main>` → `<article>` → `[role="main"]`
2. Common CMS containers (`#content`, `.entry-content`, `.post-content`, `.page-content`)
3. `<body>` minus nav, header, footer, sidebar, ads, etc.

Users can override this with custom CSS selectors or include/exclude selector lists.

## Headless API

For CI/CD pipelines or automated checks, there's a headless API at `POST /api/v1/compare` with API key authentication.

```bash
curl -X POST https://contentcheck-3000.vercel.app/api/v1/compare \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sourceUrl": "https://old-site.com/page", "targetUrl": "https://new-site.com/page"}'
```

Returns a lean JSON response with scores, missed content, and a shareable result URL.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | Yes (production) | Base URL for shareable result links |
| `SUPABASE_URL` | No | Supabase project URL. If set with `SUPABASE_SERVICE_ROLE_KEY`, results are stored in Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key (server-side only, never expose to client) |
| `ALLOWED_ORIGIN` | No | CORS origin restriction. If unset, accepts localhost in dev and same-origin requests in production |
| `API_KEYS` | No | Comma-separated `name:key` pairs for headless API auth (e.g. `myapp:sk-abc123`) |
| `RESULT_TTL_HOURS` | No | Result expiry in hours (default: 168 = 7 days) |

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router) — fullstack framework
- [TypeScript](https://www.typescriptlang.org/) (strict mode)
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [cheerio](https://cheerio.js.org/) — server-side HTML parsing
- [diff](https://www.npmjs.com/package/diff) — word-level text diffing
- [Vitest](https://vitest.dev/) — testing

## Scripts

```bash
npm run dev       # Dev server (localhost:3000)
npm run build     # Production build
npm run start     # Production server
npm run lint      # ESLint
npx vitest run    # Run tests
```

## Security

The app fetches arbitrary user-provided URLs server-side, so SSRF protection is a core concern:

- DNS resolution with private/reserved IP blocking before every fetch
- Streaming body reads with 5 MB cap (never `response.text()` directly)
- Manual redirect handling with re-validation per hop (max 3)
- Per-IP and global rate limiting
- CSS selector validation against a safe-pattern allowlist
- CORS origin validation

## Known limitations

- **No JS rendering** — client-side rendered SPAs will show minimal content
- **Heuristic extraction** — sites without semantic HTML may include non-content elements
- **No perceptual image matching** — resized/recompressed images won't match (content hash only)
- **Single page pairs** — no batch/sitemap comparison yet
- **Ephemeral storage** — without Supabase configured, results use the filesystem and are not persistent on serverless platforms

## License

Private — not open source.
