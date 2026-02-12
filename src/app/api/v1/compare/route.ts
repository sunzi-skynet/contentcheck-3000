import { NextRequest, NextResponse } from 'next/server';
import { extractApiKey, validateApiKey } from '@/lib/auth';
import { checkApiRateLimit, releaseApiRequest } from '@/lib/api-rate-limiter';
import { validateSelector } from '@/lib/url-validator';
import { runComparison, ComparisonError } from '@/lib/comparison-pipeline';
import { getResultStore } from '@/lib/result-store';
import type { ComparisonRequest, HeadlessApiResponse } from '@/lib/types';

const MAX_BODY_SIZE = 100 * 1024; // 100 KB

function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // 1. Extract and validate API key
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing API key. Use Authorization: Bearer <key> or X-API-Key header.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
    );
  }

  const authResult = await validateApiKey(apiKey);
  if (!authResult.authenticated) {
    return NextResponse.json(
      { error: 'Invalid API key', code: 'AUTH_FAILED' },
      { status: 403 }
    );
  }

  const keyName = authResult.keyInfo!.name;

  // 2. Per-key rate limiting
  const rateLimitResult = checkApiRateLimit(keyName, authResult.keyInfo!.rateLimit);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        details: rateLimitResult.reason,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfterSeconds || 60),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining ?? 0),
        },
      }
    );
  }

  try {
    // 3. Validate request body
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: 'Request body too large', code: 'BODY_TOO_LARGE' },
        { status: 400 }
      );
    }

    let body: ComparisonRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const { sourceUrl, targetUrl, sourceSelector, targetSelector, sourceAuth, targetAuth } = body;

    if (!sourceUrl || !targetUrl) {
      return NextResponse.json(
        { error: 'Both sourceUrl and targetUrl are required', code: 'MISSING_URLS' },
        { status: 400 }
      );
    }

    if (!isValidHttpUrl(sourceUrl) || !isValidHttpUrl(targetUrl)) {
      return NextResponse.json(
        { error: 'URLs must be valid http or https URLs', code: 'INVALID_URL_FORMAT' },
        { status: 400 }
      );
    }

    if (sourceSelector && !validateSelector(sourceSelector)) {
      return NextResponse.json(
        { error: 'Unsafe source CSS selector', code: 'UNSAFE_SELECTOR' },
        { status: 400 }
      );
    }
    if (targetSelector && !validateSelector(targetSelector)) {
      return NextResponse.json(
        { error: 'Unsafe target CSS selector', code: 'UNSAFE_SELECTOR' },
        { status: 400 }
      );
    }

    // 4. Run the comparison pipeline
    const result = await runComparison({
      sourceUrl,
      targetUrl,
      sourceSelector,
      targetSelector,
      sourceAuth,
      targetAuth,
    });

    // 5. Store result for shareable URL
    const store = getResultStore();
    const metadata = await store.save(result, { apiKeyName: keyName });

    // 6. Build lean headless response
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    // Group consecutive removed segments into meaningful chunks
    const missedContent: string[] = [];
    let currentSegment = '';
    for (const change of result.textDiff.changes) {
      if (change.type === 'removed') {
        currentSegment += change.value;
      } else {
        if (currentSegment.trim()) {
          missedContent.push(currentSegment.trim());
        }
        currentSegment = '';
      }
    }
    if (currentSegment.trim()) {
      missedContent.push(currentSegment.trim());
    }

    const imagePresenceScore = result.images.total === 0
      ? 100
      : (result.images.found / result.images.total) * 100;

    const response: HeadlessApiResponse = {
      resultId: metadata.id,
      resultUrl: `${baseUrl}/results/${metadata.id}`,
      overallScore: result.overallScore,
      text: {
        score: result.textDiff.similarity,
        missedContent,
      },
      images: {
        score: Math.round(imagePresenceScore * 10) / 10,
        total: result.images.total,
        found: result.images.found,
        missing: result.images.missing,
        missedImages: result.images.details.filter(d => d.status === 'missing'),
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof ComparisonError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }

    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Headless API error:', err);
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  } finally {
    releaseApiRequest(keyName);
  }
}
