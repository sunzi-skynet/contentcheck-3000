# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ContentCheck 3000** is a web app that compares a source page and target page during website migrations (e.g. CMS to CMS). It extracts main content from each page and produces a text diff and image presence report so users can judge migration completeness.

The project plan lives in `PLAN.md` — refer to it for the full technical spec, API contracts, security requirements, and implementation roadmap.

## Tech Stack

- **Next.js 14** (App Router) — fullstack framework with API routes + React UI
- **TypeScript** (strict mode)
- **Tailwind CSS** for styling
- **cheerio** for server-side HTML parsing
- **diff** (npm) for word-level text diffing
- **Built-in fetch** (Node 18+) as HTTP client
- **Vitest** + **@testing-library/react** for testing
- **No database** for MVP — results computed on the fly

## Build & Dev Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server on localhost:3000
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Run Next.js linter (ESLint)
npx vitest               # Run tests (watch mode)
npx vitest run           # Run tests once (CI)
```

## Architecture

All heavy processing (fetching, parsing, diffing) runs server-side in the API route, not in the browser.

### Processing Pipeline

```
User submits URLs → POST /api/compare
  → url-validator.ts (validate scheme, resolve DNS, block private IPs — SSRF protection)
  → fetcher.ts      (fetch HTML, streaming body with 5 MB cap, 15s timeout, encoding detection)
  → extractor.ts    (parse HTML with cheerio → extract text + images)
  → differ.ts       (word-level text diff + similarity %, capped at 50K words)
  → image-checker.ts (match source images on target, capped at 50 images)
  → Combined response with overallScore
```

### Key Directories

- `src/lib/` — Core business logic (url-validator, fetcher, extractor, differ, image-checker, rate-limiter, types). All processing happens here, independent of the framework.
- `src/app/api/compare/route.ts` — Single API endpoint that wires the pipeline together with input validation, rate limiting, and structured error responses.
- `src/app/` — Next.js App Router pages (home form + results view).
- `src/components/` — React UI components (CompareForm, DiffView, ImageReport, SummaryScore, ContentPreview).
- `src/context/` — React context (`ComparisonContext`) for passing results between pages.

### Security (Critical)

SSRF protection is mandatory — the app fetches arbitrary user-provided URLs server-side. See the Security Hardening section in `PLAN.md` for full details. Key points:

- `url-validator.ts` resolves DNS and blocks all private/reserved IP ranges before any fetch
- Fetcher uses `redirect: 'manual'`, re-validates each redirect hop (max 3)
- Response bodies are streamed with a 5 MB cap (never use `response.text()` directly)
- User-provided CSS selectors must be validated against a safe-pattern allowlist before passing to cheerio
- Rate limiting is enforced per-IP and globally (in-memory for MVP)
- CORS/Origin validation rejects cross-origin requests to the API

### Content Extraction Strategy

The extractor uses a priority-based fallback to find main content:
1. `<main>` tag
2. `<article>` tag
3. `[role="main"]`
4. Common CMS containers: `#content`, `.entry-content`, `.post-content`, `.page-content`
5. `<body>` minus structural elements and common non-content patterns (nav, header, footer, sidebar, ads, cookie banners)

Users can override this with a custom CSS selector (validated for safety first).

### Image Matching Strategy

1. **Exact URL match** — same absolute URL
2. **Filename match** — compare filenames ignoring path/domain
3. **Normalized filename match** — strip CMS-generated hashes/dimensions
4. **Content hash match** — SHA-256 of fetched image bytes (catches identical images at different URLs)
5. **Alt text match** — fallback using non-empty alt text
6. **Optional HTTP HEAD** — verify target images actually load (with SSRF protection)
