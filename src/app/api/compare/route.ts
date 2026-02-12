import { NextRequest, NextResponse } from 'next/server';
import { fetchPage } from '@/lib/fetcher';
import { extractContent } from '@/lib/extractor';
import { computeDiff } from '@/lib/differ';
import { checkImages } from '@/lib/image-checker';
import { checkRateLimit, releaseRequest } from '@/lib/rate-limiter';
import { validateSelector } from '@/lib/url-validator';
import type { ComparisonRequest, ComparisonResult } from '@/lib/types';

const MAX_BODY_SIZE = 100 * 1024; // 100 KB

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

function validateOrigin(request: NextRequest): boolean {
  const allowedOrigin =
    process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
  const origin = request.headers.get('origin');

  // Allow requests with no Origin header (same-origin, curl, server-to-server)
  if (!origin) return true;

  return origin === allowedOrigin;
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
    const { sourceUrl, targetUrl, sourceSelector, targetSelector } = body;

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

    // Fetch both pages in parallel
    let sourceHtml: string;
    let targetHtml: string;
    try {
      [sourceHtml, targetHtml] = await Promise.all([
        fetchPage(sourceUrl),
        fetchPage(targetUrl),
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch pages';

      // Differentiate URL validation errors (422) from fetch errors (502)
      if (
        message.includes('Blocked') ||
        message.includes('Blocked scheme') ||
        message.includes('private/reserved IP')
      ) {
        return NextResponse.json(
          { error: message, code: 'URL_VALIDATION_FAILED' },
          { status: 422 }
        );
      }

      return NextResponse.json(
        { error: message, code: 'FETCH_FAILED' },
        { status: 502 }
      );
    }

    // Extract content from both pages
    const sourceExtraction = extractContent(
      sourceHtml,
      sourceUrl,
      sourceSelector
    );
    const targetExtraction = extractContent(
      targetHtml,
      targetUrl,
      targetSelector
    );

    // Compute text diff
    const textDiff = computeDiff(
      sourceExtraction.text,
      targetExtraction.text
    );

    // Check images
    const imageReport = await checkImages(
      sourceExtraction.images,
      targetExtraction.images
    );

    // Calculate overall score
    const textSimilarity = textDiff.similarity;
    const imagePresenceScore =
      imageReport.total === 0
        ? 100
        : (imageReport.found / imageReport.total) * 100;
    const overallScore =
      Math.round((textSimilarity * 0.7 + imagePresenceScore * 0.3) * 10) / 10;

    const result: ComparisonResult = {
      source: {
        url: sourceUrl,
        title: sourceExtraction.title,
        extractedText: sourceExtraction.text,
        textLength: sourceExtraction.text.split(/\s+/).filter(Boolean).length,
        imageCount: sourceExtraction.images.length,
      },
      target: {
        url: targetUrl,
        title: targetExtraction.title,
        extractedText: targetExtraction.text,
        textLength: targetExtraction.text.split(/\s+/).filter(Boolean).length,
        imageCount: targetExtraction.images.length,
      },
      textDiff,
      images: imageReport,
      overallScore,
    };

    return NextResponse.json(result);
  } catch (err) {
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
