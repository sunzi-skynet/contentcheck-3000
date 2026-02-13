# ContentCheck 3000 API

## Overview

ContentCheck 3000 provides two API endpoints for comparing source and target pages during website migrations. Both endpoints run the same comparison pipeline: fetch pages, extract content, compute text diff, check image presence, and annotate HTML for visual preview.

- **Webapp endpoint** (`POST /api/compare`) — CORS-validated, IP rate-limited, returns full comparison result
- **Headless endpoint** (`POST /api/v1/compare`) — API key auth, per-key rate-limited, returns lean response + shareable URL

---

## Authentication

### Webapp endpoint

No API key required. Protected by CORS origin validation and per-IP rate limiting.

### Headless endpoint

Requires an API key via one of:

```
Authorization: Bearer <key>
X-API-Key: <key>
```

API keys are configured server-side via the `API_KEYS` environment variable (comma-separated `name:key` pairs).

---

## Endpoints

### `POST /api/compare`

Full comparison for the web UI. Returns the complete result including annotated HTML, text diff, and image report.

### `POST /api/v1/compare`

Lean comparison for programmatic use. Returns scores, missed content, and a shareable result URL.

---

## Request Body

Both endpoints accept the same JSON request body:

```json
{
  "sourceUrl": "https://old-site.com/page",
  "targetUrl": "https://new-site.com/page",
  "sourceSelector": ".main-content",
  "targetSelector": ".article-body",
  "sourceIncludeSelectors": [".article", ".summary"],
  "sourceExcludeSelectors": [".author-bio", ".cookie-banner"],
  "targetIncludeSelectors": [".article"],
  "targetExcludeSelectors": [".ad-slot", ".social-share"],
  "sourceAuth": { "username": "user", "password": "pass" },
  "targetAuth": { "username": "user", "password": "pass" }
}
```

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `sourceUrl` | `string` | URL of the original page. Must be `http://` or `https://`. |
| `targetUrl` | `string` | URL of the migrated page. Must be `http://` or `https://`. |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `sourceSelector` | `string` | CSS selector to override automatic content root detection for the source page. |
| `targetSelector` | `string` | CSS selector to override automatic content root detection for the target page. |
| `sourceIncludeSelectors` | `string[]` | Keep only elements matching these selectors within the source content root. |
| `sourceExcludeSelectors` | `string[]` | Remove elements matching these selectors from the source content. |
| `targetIncludeSelectors` | `string[]` | Keep only elements matching these selectors within the target content root. |
| `targetExcludeSelectors` | `string[]` | Remove elements matching these selectors from the target content. |
| `sourceAuth` | `object` | HTTP Basic Auth credentials (`username`, `password`) for the source page. |
| `targetAuth` | `object` | HTTP Basic Auth credentials (`username`, `password`) for the target page. |

### CSS selector rules

All CSS selectors (both single selectors and array entries) are validated against a safe-pattern allowlist. Only the following are permitted:

- Tag names: `div`, `main`, `article`
- Class selectors: `.content`, `.entry-content`
- ID selectors: `#content`, `#main-area`
- Descendant combinators: `div article`
- Child combinators: `div > article`
- Comma-separated groups: `main, article` (single selector field only)

Attribute selectors (`[data-x]`), pseudo-classes (`:nth-child`), and universal selectors (`*`) are rejected.

Include/exclude arrays accept up to **10 selectors** each.

### Content extraction order

1. **Find content root** — custom selector (`sourceSelector`/`targetSelector`) overrides auto-detection. Auto-detection tries `<main>`, `<article>`, `[role="main"]`, and common CMS containers in order, falling back to `<body>`.
2. **Strip noise** — `<script>`, `<style>`, `<nav>`, `<noscript>`, `<iframe>` are always removed. When falling back to `<body>`, additional structural elements (header, footer, sidebar, ads) are also removed.
3. **Apply include selectors** — if `includeSelectors` is provided, only matching elements and their content are kept. Multiple selectors are OR'd (union).
4. **Apply exclude selectors** — if `excludeSelectors` is provided, matching elements are removed from the remaining content.
5. **Extract text and images** — from the filtered content.

Include and exclude selectors compose with each other and with the content root selector. For example, you can use `sourceSelector` to pick a broad container, `sourceIncludeSelectors` to narrow to specific sections, and `sourceExcludeSelectors` to remove ads within those sections.

---

## Responses

### `POST /api/compare` — Full response

```json
{
  "source": {
    "url": "https://old-site.com/page",
    "title": "Page Title",
    "extractedText": "Full extracted text...",
    "textLength": 450,
    "imageCount": 3
  },
  "target": {
    "url": "https://new-site.com/page",
    "title": "Page Title",
    "extractedText": "Full extracted text...",
    "textLength": 462,
    "imageCount": 3
  },
  "textDiff": {
    "similarity": 94.5,
    "changes": [
      { "type": "equal", "value": "shared text " },
      { "type": "removed", "value": "old text " },
      { "type": "added", "value": "new text " }
    ]
  },
  "images": {
    "total": 3,
    "found": 2,
    "missing": 1,
    "details": [
      {
        "src": "https://old-site.com/img/photo.jpg",
        "alt": "Photo",
        "status": "found",
        "matchMethod": "filename",
        "targetMatch": "https://cdn.new-site.com/photo.jpg"
      },
      {
        "src": "https://old-site.com/img/chart.png",
        "alt": "Chart",
        "status": "missing"
      }
    ]
  },
  "overallScore": 88.2,
  "annotatedContent": {
    "sourceHtml": "<!DOCTYPE html>...",
    "targetHtml": "<!DOCTYPE html>..."
  }
}
```

| Field | Description |
|-------|-------------|
| `source` / `target` | Page metadata and extraction stats. `textLength` is word count. |
| `textDiff.similarity` | Text similarity percentage (0-100). |
| `textDiff.changes` | Word-level diff. `equal` = shared, `removed` = only on source, `added` = only on target. |
| `images.details[].status` | `found` = matched on target, `missing` = not found, `unverified` = match unconfirmed. |
| `images.details[].matchMethod` | How the image was matched: `exact-url`, `filename`, `normalized-filename`, `content-hash`, or `alt-text`. |
| `overallScore` | Weighted score: 70% text similarity + 30% image presence (0-100). |
| `annotatedContent` | Full HTML documents for iframe rendering with diff highlights and sync-scroll markup. |

### `POST /api/v1/compare` — Lean response

```json
{
  "resultId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "resultUrl": "https://your-domain.com/results/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "overallScore": 88.2,
  "text": {
    "score": 94.5,
    "missedContent": [
      "This paragraph was removed during migration.",
      "Another piece of missing text."
    ]
  },
  "images": {
    "score": 66.7,
    "total": 3,
    "found": 2,
    "missing": 1,
    "missedImages": [
      {
        "src": "https://old-site.com/img/chart.png",
        "alt": "Chart",
        "status": "missing"
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `resultId` | UUID for the stored result. |
| `resultUrl` | Shareable URL to view the full comparison in the browser. Results expire after 7 days (configurable via `RESULT_TTL_HOURS`). |
| `text.score` | Text similarity percentage (0-100). |
| `text.missedContent` | Grouped segments of text present on source but missing from target. |
| `images.score` | Image presence percentage (0-100). |
| `images.missedImages` | Only images with `status: "missing"`. |

---

## Error Responses

All errors return a JSON body with `error` (message) and `code` fields:

```json
{
  "error": "Both sourceUrl and targetUrl are required",
  "code": "MISSING_URLS",
  "details": "optional additional context"
}
```

### Error codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_JSON` | 400 | Malformed JSON body. |
| `BODY_TOO_LARGE` | 400 | Request body exceeds 100 KB. |
| `MISSING_URLS` | 400 | `sourceUrl` or `targetUrl` not provided. |
| `INVALID_URL_FORMAT` | 400 | URL is not a valid `http://` or `https://` URL. |
| `UNSAFE_SELECTOR` | 400 | CSS selector fails the safe-pattern allowlist, or a selector array is invalid. |
| `AUTH_REQUIRED` | 401 | Missing API key (headless endpoint only). |
| `AUTH_FAILED` | 403 | Invalid API key (headless endpoint only). |
| `CORS_REJECTED` | 403 | Origin header not allowed (webapp endpoint only). |
| `RATE_LIMITED` | 429 | Too many requests. Includes `Retry-After` header. |
| `URL_VALIDATION_FAILED` | 422 | URL resolves to a private/reserved IP (SSRF protection). |
| `FETCH_FAILED` | 502 | Failed to fetch one of the target pages. |
| `INTERNAL_ERROR` | 500 | Unexpected server error. |

---

## Examples

### Basic comparison

```bash
curl -X POST http://localhost:3000/api/compare \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://old-site.com/about",
    "targetUrl": "https://new-site.com/about"
  }'
```

### With content root override

```bash
curl -X POST http://localhost:3000/api/compare \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://old-site.com/about",
    "targetUrl": "https://new-site.com/about",
    "sourceSelector": "#main-content",
    "targetSelector": ".article-body"
  }'
```

### With include/exclude selectors

```bash
curl -X POST http://localhost:3000/api/compare \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://old-site.com/about",
    "targetUrl": "https://new-site.com/about",
    "sourceExcludeSelectors": [".author-bio", ".related-posts"],
    "targetExcludeSelectors": [".ad-slot"]
  }'
```

### Include specific sections only

```bash
curl -X POST http://localhost:3000/api/compare \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://old-site.com/about",
    "targetUrl": "https://new-site.com/about",
    "sourceIncludeSelectors": [".article-body", ".sidebar-content"],
    "targetIncludeSelectors": [".article-body", ".sidebar-content"]
  }'
```

### Headless API with authentication

```bash
curl -X POST http://localhost:3000/api/v1/compare \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_abc123" \
  -d '{
    "sourceUrl": "https://old-site.com/about",
    "targetUrl": "https://staging.new-site.com/about",
    "targetAuth": { "username": "preview", "password": "secret" },
    "sourceExcludeSelectors": [".cookie-banner", ".newsletter-signup"]
  }'
```

---

## Rate Limits

### Webapp endpoint (`/api/compare`)

- Per-IP rate limiting (in-memory)

### Headless endpoint (`/api/v1/compare`)

- Per-API-key rate limiting
- Response includes `X-RateLimit-Remaining` header
- When limited, response includes `Retry-After` header (seconds)

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEYS` | Comma-separated `name:key` pairs for headless API auth. Example: `myapp:sk_live_abc123,other:sk_live_xyz` | — |
| `NEXT_PUBLIC_BASE_URL` | Base URL for shareable result links in headless responses. | Request origin |
| `RESULT_TTL_HOURS` | How long stored results are retained (hours). | `168` (7 days) |
| `ALLOWED_ORIGIN` | Restrict CORS to this origin for the webapp endpoint. | Any `localhost` origin |
