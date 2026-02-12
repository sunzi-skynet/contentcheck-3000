import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, releaseRequest } from '@/lib/rate-limiter';
import { validateSelector } from '@/lib/url-validator';
import { runComparison, ComparisonError } from '@/lib/comparison-pipeline';
import type { ComparisonRequest } from '@/lib/types';

const MAX_BODY_SIZE = 100 * 1024; // 100 KB

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');

  // Allow requests with no Origin header (same-origin, curl, server-to-server)
  if (!origin) return true;

  // If an explicit allowed origin is configured, enforce it
  if (process.env.ALLOWED_ORIGIN) {
    return origin === process.env.ALLOWED_ORIGIN;
  }

  // In development, allow any localhost origin (port may vary)
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  // CORS/Origin validation
  if (!validateOrigin(request)) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'CORS_REJECTED' },
      { status: 403 }
    );
  }

  // Rate limiting
  const rateLimitResult = checkRateLimit(clientIp);
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
        },
      }
    );
  }

  try {
    // Check body size
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: 'Request body too large', code: 'BODY_TOO_LARGE' },
        { status: 400 }
      );
    }

    // Parse body
    let body: ComparisonRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    // Validate required fields
    const { sourceUrl, targetUrl, sourceSelector, targetSelector, sourceAuth, targetAuth } = body;

    if (!sourceUrl || !targetUrl) {
      return NextResponse.json(
        {
          error: 'Both sourceUrl and targetUrl are required',
          code: 'MISSING_URLS',
        },
        { status: 400 }
      );
    }

    if (!isValidHttpUrl(sourceUrl) || !isValidHttpUrl(targetUrl)) {
      return NextResponse.json(
        {
          error: 'URLs must be valid http or https URLs',
          code: 'INVALID_URL_FORMAT',
        },
        { status: 400 }
      );
    }

    // Validate selectors if provided
    if (sourceSelector && !validateSelector(sourceSelector)) {
      return NextResponse.json(
        {
          error: 'Unsafe source CSS selector',
          code: 'UNSAFE_SELECTOR',
          details:
            'Only tag names, classes, IDs, and simple combinators are allowed',
        },
        { status: 400 }
      );
    }
    if (targetSelector && !validateSelector(targetSelector)) {
      return NextResponse.json(
        {
          error: 'Unsafe target CSS selector',
          code: 'UNSAFE_SELECTOR',
          details:
            'Only tag names, classes, IDs, and simple combinators are allowed',
        },
        { status: 400 }
      );
    }

    // Run the comparison pipeline
    const result = await runComparison({
      sourceUrl,
      targetUrl,
      sourceSelector,
      targetSelector,
      sourceAuth,
      targetAuth,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ComparisonError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }

    const message =
      err instanceof Error ? err.message : 'Internal server error';
    console.error('Comparison error:', err);
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  } finally {
    releaseRequest(clientIp);
  }
}
