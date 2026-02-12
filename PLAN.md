# Migration Checker - MVP Plan

## Context

During website migration projects (e.g. CMS to CMS), content (text and images) must be preserved even though the UI, navigation, and layout will change. There's currently no easy tool to verify that migration was successful at the content level.

**Migration Checker** is a web app that lets users compare a source page and a target page, extracts the main content area from each, and shows a clear diff of what text changed and which images are present or missing.

**MVP goal**: A working web app where a user can enter two URLs, see a text diff and image presence report, and judge migration completeness.

### Competitive Landscape

No existing tool fills this exact niche. Adjacent tools fall short for CMS-to-CMS content validation:

| Category | Examples | Gap |
|---|---|---|
| Visual regression (Percy, BackstopJS, Wraith) | Compare screenshots pixel-by-pixel | Useless when the design *intentionally* changes during migration |
| SEO migration (Screaming Frog, SearchViu, SEOMigrator) | Focus on metadata, redirects, keywords | Don't provide body content text diffs or image presence checking |
| HTML diff (SiteDiff — open-source Ruby CLI) | Diffs raw HTML markup | Extremely noisy when template/CMS changes but content stays the same |
| Free online text comparers (Copyscape, SmallSEOTools) | Full-page text comparison | No smart content extraction (include nav/footer), no image checking |

**Our differentiation**: Smart content-area extraction (strip nav/header/footer) + word-level text diff + image-by-image presence checking + clean web UI with no installation. This specific combination does not exist today.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 14 (App Router)** | Fullstack in one project. API routes + React UI. Huge ecosystem for later (auth, payments). |
| Language | **TypeScript** | Safety, better tooling. We'll keep patterns simple. |
| Styling | **Tailwind CSS** | Fast to build clean UI without writing custom CSS. |
| HTML parsing | **cheerio** | Lightweight server-side HTML parsing (jQuery-like API). No browser needed. |
| Text diffing | **diff** (npm) | Battle-tested diffing library. Produces word-level and line-level diffs. |
| HTTP client | **built-in fetch** (Node 18+) | No extra dependency needed. |
| Testing | **Vitest** + **@testing-library/react** | Fast, TypeScript-native test runner with Jest-compatible API. Testing-library for component tests. |
| Database | **None for MVP** | Results computed on the fly. Add persistence later (see Future Enhancements). |

---

## Architecture

```
migration-checker/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout with nav
│   │   ├── page.tsx                  # Landing page with compare form
│   │   ├── results/
│   │   │   └── page.tsx              # Results view (client state via React context)
│   │   └── api/
│   │       └── compare/
│   │           └── route.ts          # POST: run full comparison
│   ├── lib/
│   │   ├── fetcher.ts                # Fetch a URL with SSRF protection, return HTML string
│   │   ├── extractor.ts              # HTML → { text, images[] } using cheerio
│   │   ├── differ.ts                 # Compute text diff between two strings
│   │   ├── image-checker.ts          # Check which source images exist on target
│   │   ├── url-validator.ts          # URL validation + SSRF protection (DNS resolution, IP blocking)
│   │   ├── rate-limiter.ts           # Per-IP and global rate limiting
│   │   └── types.ts                  # Shared TypeScript types
│   ├── components/
│   │   ├── CompareForm.tsx            # Source URL + Target URL input form
│   │   ├── DiffView.tsx              # Side-by-side or inline text diff display
│   │   ├── ImageReport.tsx           # Table of images: found / missing on target
│   │   ├── SummaryScore.tsx          # Overall migration completeness %
│   │   └── ContentPreview.tsx        # Collapsible raw extracted text for source & target (debug/transparency aid)
│   └── context/
│       └── ComparisonContext.tsx      # React context to hold results across pages
├── __tests__/
│   └── lib/                        # Unit tests for core logic (url-validator, fetcher, etc.)
├── package.json
├── next.config.ts
├── vitest.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Security Hardening

Security is not a post-MVP afterthought. The core feature (fetching arbitrary user-provided URLs server-side) creates a significant attack surface that must be addressed before any deployment.

### SSRF Protection (`lib/url-validator.ts`)

Server-Side Request Forgery is the **#1 threat**. An attacker submits internal/cloud URLs to access private resources via your server.

**Attack vectors to defend against:**
- Cloud metadata endpoints: `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
- Internal network scanning: `http://localhost:*`, `http://10.0.0.0/8`, `http://192.168.0.0/16`
- IP obfuscation: decimal (`http://2130706433`), hex (`http://0x7f000001`), octal, IPv6-mapped addresses
- DNS rebinding: hostname resolves to a safe IP during validation, then to `127.0.0.1` when the request fires
- Redirect-based bypass: `https://attacker.com` → 301 → `http://169.254.169.254/`

**Required mitigations:**
1. **Allowlist schemes**: Only permit `http://` and `https://`. Block `file://`, `gopher://`, `data://`, `ftp://`, etc.
2. **Resolve DNS and validate the resolved IP** before making the request. Block all private/reserved ranges:
   - `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - `169.254.0.0/16` (link-local / cloud metadata)
   - `0.0.0.0/8`, `::1`, `fc00::/7`, `fe80::/10`
3. **Disable automatic redirect following**: Use `redirect: 'manual'` on fetch. If following redirects manually, re-validate each destination IP. Cap at 3 hops.
4. **Cloud-level defense**: Use IMDSv2 on AWS (requires session tokens). Add firewall rules blocking outbound connections from the app server to `169.254.169.254`.

> **MVP note — DNS pinning deferred**: Ideally the resolved IP would be pinned to the connection to prevent DNS rebinding attacks (TOCTOU race between DNS validation and fetch). However, Node's built-in `fetch` does not expose connection-level DNS control without significant workarounds (custom `undici.Agent` or switching to `http.request`, which breaks TLS/SNI for HTTPS). For MVP, we accept this risk and rely on the other SSRF layers. DNS pinning is a post-MVP hardening item.

### Resource Limits (DoS Prevention)

| Resource | Limit | Rationale |
|---|---|---|
| Response body size | **5 MB max** | Prevent memory exhaustion from huge pages. Stream response and abort if exceeded. |
| Request timeout | **15 seconds** default (`AbortSignal.timeout()`), **configurable via `FETCH_TIMEOUT_MS` env var** | Prevent slow-response attacks tying up workers. Must be set below the platform's function timeout (e.g. 8s on Vercel hobby tier's 10s limit) to allow clean error handling before the platform kills the process. |
| HTML document size before parsing | **5 MB** | Cheerio loads entire DOM into memory; cap it before parsing. |
| Text length before diffing | **50,000 words** | `diff` is O(n×m) worst case; cap input to prevent CPU exhaustion. Defense-in-depth: the extractor also truncates at 50K words, so this cap guards against callers that bypass the extractor. |
| Images per comparison | **50 source images max** | Prevent amplification. Content hash matching is a batch operation: all unmatched source + target images are fetched and hashed (worst case: 50 source + 50 target = 100 GETs), plus up to 50 HEAD verifications — up to ~150 outbound requests total. |
| Image fetch size for content hashing | **10 MB max per image** | Prevent memory exhaustion from large images during hash comparison. |
| Image fetch timeout | **5 seconds per image** | Prevent slow image responses from stalling the entire comparison. |
| Redirect hops | **3 max** | Prevent infinite redirect loops. |

### Rate Limiting (`lib/rate-limiter.ts`)

> **Serverless caveat**: The MVP rate limiter uses in-memory state, which resets on every cold start and is not shared across instances. On serverless platforms (Vercel, AWS Lambda), this provides **minimal protection** — it only guards against burst abuse within a single warm instance. This is an accepted MVP trade-off; see Known Limitations for the migration path to an external store (Redis/Upstash). On long-lived servers (VPS, Railway), the in-memory limiter works as expected.

| Scope | Limit | Purpose |
|---|---|---|
| Per IP | 10 requests/minute | Prevent individual abuse |
| Per IP | 100 requests/hour | Hourly usage cap |
| Global | 1,000 requests/hour | Protect overall infrastructure |
| Concurrent per IP | 2 simultaneous | Prevent connection exhaustion |

### Proxy Abuse Prevention

The app is effectively an open proxy. Without controls, attackers can use it to scrape sites from your IP, bypass IP bans, or DDoS targets.

**Mitigations:**
- Rate limiting (above)
- Set a custom `User-Agent` header identifying the service (e.g. `MigrationChecker/1.0`) so site operators can identify and block requests
- Do not store or cache fetched content beyond the comparison response lifecycle
- Consider adding CAPTCHA or simple proof-of-work on the form to prevent automated abuse

### CORS / CSRF Protection

The `POST /api/compare` endpoint must not be callable from arbitrary third-party origins. Without protection, an attacker could embed a form or script on their site that submits to the API, using visitors as unwitting proxies.

**Required mitigations:**
1. **Origin header validation**: Reject requests where the `Origin` header doesn't match the app's own origin. The allowed origin is configured via the `ALLOWED_ORIGIN` environment variable (e.g. `https://migration-checker.vercel.app`). In development, default to `http://localhost:3000`. Return `403 Forbidden` for mismatches.
2. **`SameSite` cookies** (if cookies are used later): Ensure cookies are `SameSite=Strict` or `SameSite=Lax`.
3. **No CORS wildcard**: Do not set `Access-Control-Allow-Origin: *`. Only allow the app's own origin.

### CSS Selector Validation

User-provided CSS selectors (the optional override feature) can trigger ReDoS in cheerio's `css-what` dependency. **Restrict to safe patterns only**: tag names, class selectors, ID selectors, and simple combinators. Reject complex attribute selectors and pseudo-classes. Validate with a regex allowlist before passing to cheerio.

---

## Core Logic (Step by Step)

### 1. URL Validator (`lib/url-validator.ts`)
- Parse URL: validate scheme is `http` or `https`
- Resolve hostname to IP via DNS lookup
- Reject if resolved IP falls in any private/reserved range (see Security section)
- Return validated URL (resolved IP is used for validation only; DNS pinning is deferred — see Security section)

### 2. Fetcher (`lib/fetcher.ts`)
- Accept validated URL from url-validator
- Fetch with appropriate headers: custom `User-Agent` (`MigrationChecker/1.0`), `Accept: text/html`
- Set `redirect: 'manual'` — handle redirects manually with re-validation (max 3 hops)
- Enforce `AbortSignal.timeout(FETCH_TIMEOUT_MS)` for total request timeout (default 15000, configurable via env var)
- **Stream response body** and abort if accumulated bytes exceed 5 MB (do not use `response.text()` directly)
- Validate `Content-Type` header: accept `text/html` and `application/xhtml+xml` (with optional charset/params). Use a prefix/includes check, not exact equality.
- **Detect character encoding**: Check `Content-Type` charset parameter (e.g. `charset=iso-8859-1`). If no charset in the header, perform a preliminary decode of the raw bytes as `latin-1` (which is byte-transparent and safe for sniffing) and scan for `<meta charset="...">` or `<meta http-equiv="Content-Type" content="...;charset=...">` in the first 1024 bytes. Convert non-UTF-8 responses to UTF-8 using `TextDecoder` with the detected encoding. Default to UTF-8 if undetectable.
- Return decoded HTML string (always UTF-8)

### 3. Content Extractor (`lib/extractor.ts`)
- Parse HTML with cheerio
- **Smart auto-detect strategy** (in order, using **first match** at each level — if multiple elements match a selector, use the first one in document order):
  1. Look for `<main>` tag
  2. Look for `<article>` tag
  3. Look for `[role="main"]`
  4. Look for common CMS content containers: `#content`, `.entry-content`, `.post-content`, `.page-content`
  5. Fall back to `<body>` minus `<nav>`, `<header>`, `<footer>`, `<aside>`, `<script>`, `<style>`, `.sidebar`, `.widget`, `.cookie-banner`, `.advertisement`
- Allow **optional CSS selector override** from user (e.g. `#content`, `.article-body`) — **validated against safe-pattern allowlist first** (see Security section)
- Extract:
  - **Title**: Get the page `<title>` text (used in API response metadata).
  - **Text**: Get visible text content, normalize whitespace, preserve paragraph structure. **Truncate to 50,000 words** before returning.
  - **Images**: Collect all `<img>` tags → `{ src (absolute URL), alt }` list. Also check `<picture>` `<source>` elements. **Resolve all relative URLs to absolute** using the page's base URL. CSS `background-image` scanning is deferred to post-MVP.

### 4. Text Differ (`lib/differ.ts`)
- Use `diff` library to produce word-level diff
- Calculate similarity percentage: `unchanged_words / max(source_word_count, target_word_count) * 100`. Uses `max` so that both deletions (target shorter) and additions (target longer) reduce the score symmetrically.
- Return structured diff result with additions, deletions, unchanged sections

### 4a. Overall Score Calculation
The `overallScore` returned by the API is a weighted average of the two sub-scores:
- **Text similarity** (weight 0.7): the percentage from the differ (section 4 above)
- **Image presence** (weight 0.3): `found_images / source_image_count * 100` (0 source images → 100%)

Formula: `overallScore = textSimilarity * 0.7 + imagePresenceScore * 0.3`

Text is weighted higher because it is the primary content being migrated; images are supplementary. These weights can be adjusted later or made user-configurable.

### 5. Image Checker (`lib/image-checker.ts`)
- **Cap at 50 source images** per comparison to prevent amplification (all target images are considered as match candidates, but only the first 50 source images are checked)
- For each source image, match against target images using a layered strategy:
  1. **Exact URL match**: Same absolute URL (covers CDN-hosted assets that don't change)
  2. **Filename match**: Compare filenames ignoring path/domain (e.g. `banner.jpg`)
  3. **Normalized filename match**: Strip CMS-generated hashes/dimensions (e.g. `banner-300x200-a3f8b2c.jpg` → `banner.jpg`)
  4. **Content hash match**: Pre-fetch **all** source and target images that remain unmatched after steps 1-3, compute SHA-256 hashes in batch, then match by hash. This is a batch operation — not per-image — so the total cost is up to `unmatched_source + unmatched_target` GET requests (worst case: 50 + 50 = 100). Catches identical images hosted at completely different URLs/filenames. Apply same SSRF protections, timeout (5s), and size cap (10 MB) to all image fetches.
  5. **Alt text match**: If filenames and content hashes differ, match by non-empty alt text
  6. **Optional HTTP HEAD verification**: Verify matched target images actually load (HTTP 200). Apply same SSRF protections and timeout (5s) to HEAD requests.
- Return: list of `{ sourceImage, status: 'found' | 'missing' | 'unverified', matchMethod?, targetMatch? }`

---

## API Design

### `POST /api/compare`

**Middleware (applied before handler):**
1. Rate limit check (per-IP, see Security section)
2. Request body size limit: **100 KB max**
3. Input validation: both URLs required, valid format, `http`/`https` only

**Request body:**
```json
{
  "sourceUrl": "https://old-site.com/about",
  "targetUrl": "https://new-site.com/about-us",
  "sourceSelector": null,
  "targetSelector": null
}
```

**Validation rules:**
- `sourceUrl` and `targetUrl`: required, must be valid `http://` or `https://` URLs
- `sourceSelector` and `targetSelector`: optional, if provided must match safe CSS selector pattern (tag, class, ID only)
- Reject requests where either URL points to a private/reserved IP range (fail fast before fetching)

**Response:**
```json
{
  "source": { "url": "...", "title": "...", "extractedText": "...", "textLength": 1234, "imageCount": 5 },
  "target": { "url": "...", "title": "...", "extractedText": "...", "textLength": 1210, "imageCount": 4 },
  "textDiff": {
    "similarity": 94.5,
    "changes": [
      { "type": "equal", "value": "Welcome to our company..." },
      { "type": "removed", "value": "old text here" },
      { "type": "added", "value": "new text here" }
    ]
  },
  "images": {
    "total": 5,
    "found": 4,
    "missing": 1,
    "details": [
      { "src": "https://old-site.com/images/logo.png", "alt": "Logo", "status": "found", "matchMethod": "filename", "targetMatch": "https://new-site.com/assets/logo.png" },
      { "src": "https://old-site.com/images/banner.jpg", "alt": "Hero", "status": "missing" }
    ]
  },
  "overallScore": 91.2
}
```

**Error responses:**
- `400`: Invalid input (bad URL format, unsafe selector)
- `422`: URL validation failed (private IP, non-HTTP scheme)
- `429`: Rate limit exceeded (include `Retry-After` header)
- `502`: Upstream fetch failed (target site unreachable, timeout, non-HTML response)
- `500`: Internal server error

---

## UI Pages

### 1. Home / Compare Page (`page.tsx`)
- Clean form with:
  - Source URL input
  - Target URL input
  - Optional: "Advanced" toggle → CSS selector fields for source and target
  - "Compare" button
- Loading state with progress indication while comparison runs

### 2. Results Page (`results/page.tsx`)
- **Summary bar**: Overall score (%), text similarity %, images found ratio
- **Content preview section**: Collapsible panels showing the raw extracted text for source and target. Helps users verify that the extractor found the right content area (especially when auto-detection falls back to `<body>`).
- **Text diff section**: Inline diff view with red (removed) / green (added) highlighting
- **Image report section**: Table showing each source image, its status, match method, and the matched target image
- "Compare another" button to go back
- **State management**: Results are held in React context (`ComparisonContext`), not URL searchParams. This avoids URL length limits and data loss, while keeping the results available across page navigation. If context is empty (e.g. direct navigation to `/results`), redirect to home.

---

## Implementation Order

### Phase 1: Project Setup
1. Initialize Next.js project with TypeScript and Tailwind
2. Set up project structure (folders, base files)
3. Install dependencies: `cheerio`, `diff`, `vitest`, `@testing-library/react`
4. Configure Vitest (`vitest.config.ts`)

### Phase 2: Security Foundation
5. Build `url-validator.ts` - URL scheme validation, DNS resolution, private IP blocking
6. Build `rate-limiter.ts` - Per-IP and global rate limiting (in-memory for MVP)
7. Build CORS/Origin validation middleware - reject cross-origin requests

### Phase 3: Core Engine
8. Build `types.ts` - Shared type definitions
9. Build `fetcher.ts` - URL fetching with SSRF protection, streaming body with size cap, timeout, redirect handling, encoding detection
10. Build `extractor.ts` - HTML parsing + content extraction with extended fallback strategy, resolve relative image URLs to absolute
11. Build `differ.ts` - Text diffing + similarity score with input length cap
12. Build `image-checker.ts` - Image presence checking with layered matching (including content hash) + cap

### Phase 4: API
13. Build `POST /api/compare` route with input validation, rate limiting, CORS validation, and structured error responses

### Phase 5: UI
14. Build `ComparisonContext` for cross-page state management
15. Build `CompareForm` component and home page
16. Build `DiffView` component (inline diff with color highlighting)
17. Build `ImageReport` component
18. Build `SummaryScore` component
19. Build `ContentPreview` component (collapsible raw extracted text for source & target)
20. Build results page that displays all components

### Phase 6: Polish & Test
21. Error handling UX (user-friendly messages for all error codes)
22. Loading states and UX polish
23. Write unit tests for security-critical modules (`url-validator`, `fetcher`, `rate-limiter`) using Vitest
24. Test with real migration scenarios (see Verification section)
25. Security testing: attempt SSRF bypasses, oversized payloads, rate limit evasion, cross-origin requests

---

## Legal & Compliance

The app fetches and processes third-party web content on behalf of users, which creates legal exposure:

- **Terms of Service**: The app must have its own ToS requiring users to only compare sites they are authorized to access. This is the primary legal shield.
- **Copyright**: Fetched content is processed transiently for comparison only — never stored, cached, or re-published. Display only diffs and excerpts, not full reproduced content.
- **robots.txt**: Respecting `robots.txt` is deferred to post-MVP (see Future Enhancements). When added, the app should check before fetching and warn users if the target disallows automated access. Not legally binding in all jurisdictions, but demonstrates good faith.
- **Privacy (GDPR/CCPA)**: If pages contain personal data, the app acts as a data processor. Since the MVP stores nothing and computes on-the-fly, exposure is minimal — but never add persistent storage of fetched content without a privacy review.
- **User-Agent transparency**: Always identify as `MigrationChecker/1.0` so site operators can identify and block requests if desired.

---

## Cost & Hosting Considerations

### Cost Amplification

Each user request triggers: 2 full page fetches + HTML parsing × 2 + text diff + up to 50 image content-hash comparisons (up to 100 image GET requests + 50 HEAD verifications). This means 1 inbound API call can fan out to ~150+ outbound requests and significant CPU/bandwidth.

### Hosting Scenarios

| Platform | Limits (free/hobby tier) | Risk |
|---|---|---|
| **Vercel** | 10s function timeout (hobby), 100 GB bandwidth/month | Hobby timeout (10s) is shorter than the app's 15s fetch timeout, so it acts as the effective cap. Bandwidth abuse is the main risk. |
| **Railway/Render** | ~500 hours/month compute | Slow fetches consume compute even while waiting |
| **VPS (DigitalOcean, etc.)** | Fixed resources | More predictable but requires manual scaling |

### Cost Mitigations

- All resource limits from the Security section directly reduce cost exposure
- Set **budget alerts** on cloud provider
- Vercel's 10s hobby timeout naturally caps runaway requests — don't increase it unless moving to a paid plan
- Monitor bandwidth usage; egress is the primary cost on cloud platforms (~$0.09/GB)

---

## Known Limitations (MVP)

These are accepted trade-offs for the MVP. Each has a path to resolution in future versions.

| Limitation | Impact | Future Fix |
|---|---|---|
| **No JS rendering** | Sites that render content client-side (React, Vue, Angular SPAs) will show empty/minimal content | Add Puppeteer/Playwright headless browser mode |
| **Content extraction is heuristic** | Sites without semantic HTML (`<main>`, `<article>`) may include sidebar/widget content in the extraction | Custom CSS selector override helps; could add ML-based content detection later |
| **Image matching has no perceptual comparison** | Images that are resized or recompressed will not match despite being visually identical (content hash only matches byte-identical files) | Add perceptual hash comparison (e.g. `sharp` + `phash`) |
| **No batch comparison** | Users must compare one page pair at a time | Add sitemap crawl + CSV upload for URL mapping |
| **No persistence** | Results are lost on page refresh (held in React context only) | Add database + comparison history |
| **Single-page focus** | Cannot assess overall migration completeness across an entire site | Add bulk dashboard with progress tracking |
| **Sites that block scraping** | CAPTCHAs, bot detection, and WAFs will cause fetch failures | Headless browser mode + user-provided cookies/auth headers |
| **DNS rebinding (TOCTOU)** | An attacker could theoretically bypass SSRF checks via DNS rebinding since DNS is not pinned to the connection | Implement DNS pinning via custom `undici.Agent` or `http.request` with SNI handling |
| **Rate limiter is in-memory** | Resets on server restart / serverless cold start; ineffective across multiple instances | Use external store (Redis / Upstash / Supabase) for rate limit state |
| **Target-only images not reported** | Images present on the target but absent from the source are silently ignored; could miss injected or unwanted content | Add a `newOnTarget` list to the image report showing images found only on the target page |

---

## Future Enhancements (Post-MVP)
- **Supabase integration**: Add persistence layer (comparison history, rate limit state, user accounts). Free tier covers 500 MB + 50K MAU. Replaces in-memory rate limiter with durable state.
- **Sitemap-based crawl**: Auto-discover pages from sitemap.xml, batch compare
- **URL mapping file**: CSV/JSON upload to map source → target URLs
- **Project/history persistence**: Supabase (PostgreSQL) to save comparisons
- **User accounts + auth**: NextAuth.js + Supabase Auth
- **Headless browser mode**: Puppeteer/Playwright for JS-rendered sites
- **DNS pinning**: Implement via custom `undici.Agent` or `http.request` with SNI handling to close DNS rebinding attack vector
- **robots.txt respect**: Check `robots.txt` before fetching and warn users if the target disallows automated access (noted in Legal section but deferred from MVP implementation)
- **Perceptual image hashing**: Add `sharp` + phash for images that are resized/recompressed but visually identical
- **CSS `background-image` scanning**: Extract images from inline styles and `<style>` blocks
- **Payment**: Stripe integration (free tier + paid plans)
- **Export**: PDF/CSV reports of migration status
- **Bulk comparison dashboard**: Progress tracking across entire site migration

---

## Verification

### Functional Tests
1. `npm run dev` → app starts on localhost:3000
2. Enter a source URL and target URL of a known migrated page
3. Verify: content is extracted (not nav/footer), text diff is accurate, images are checked
4. Test edge cases: pages with no `<main>` tag, missing images, different URL structures
5. Test error handling: invalid URL, site that blocks scraping, timeout
6. Test results page: navigate away and back, verify context holds; direct-navigate to `/results` and verify redirect to home
7. Test with pages of varying sizes: small (1 KB), medium (100 KB), large (1+ MB)

### Security Tests
8. SSRF: submit `http://169.254.169.254/latest/meta-data/` — must be rejected
9. SSRF: submit `http://127.0.0.1`, `http://0x7f000001`, `http://[::1]` — all must be rejected
10. SSRF: submit a URL that 301-redirects to `http://169.254.169.254/` — must be rejected at redirect
11. DoS: submit a URL pointing to a very large file (>5 MB) — must abort with error, not crash
12. DoS: submit a URL that responds extremely slowly — must timeout at 15s
13. Rate limiting: submit 15 rapid requests from the same IP — requests beyond 10/min must return 429
14. CSS selector: submit a pathological selector — must be rejected before reaching cheerio
15. Input validation: submit `file:///etc/passwd`, `gopher://`, `data:text/html,...` — all must be rejected
16. CORS: submit a POST from a different origin (e.g. `curl -H "Origin: https://evil.com"`) — must return 403
