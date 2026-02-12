import { fetchPage } from './fetcher';
import { extractContent } from './extractor';
import { computeDiff } from './differ';
import { checkImages } from './image-checker';
import { annotateContent } from './annotator';
import type { AuthCredentials, ComparisonResult } from './types';

export interface PipelineInput {
  sourceUrl: string;
  targetUrl: string;
  sourceSelector?: string | null;
  targetSelector?: string | null;
  sourceAuth?: AuthCredentials | null;
  targetAuth?: AuthCredentials | null;
}

export class ComparisonError extends Error {
  constructor(
    message: string,
    public readonly code: 'URL_VALIDATION_FAILED' | 'FETCH_FAILED' | 'INTERNAL_ERROR',
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = 'ComparisonError';
  }
}

/**
 * Run the full comparison pipeline: fetch → extract → diff → image-check → annotate → score.
 * Both /api/compare and /api/v1/compare call this function.
 */
export async function runComparison(input: PipelineInput): Promise<ComparisonResult> {
  // 1. Fetch both pages in parallel
  let sourceHtml: string;
  let targetHtml: string;
  try {
    [sourceHtml, targetHtml] = await Promise.all([
      fetchPage(input.sourceUrl, input.sourceAuth),
      fetchPage(input.targetUrl, input.targetAuth),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch pages';
    if (
      message.includes('Blocked') ||
      message.includes('Blocked scheme') ||
      message.includes('private/reserved IP')
    ) {
      throw new ComparisonError(message, 'URL_VALIDATION_FAILED', 422);
    }
    throw new ComparisonError(message, 'FETCH_FAILED', 502);
  }

  // 2. Extract content from both pages
  const sourceExtraction = extractContent(sourceHtml, input.sourceUrl, input.sourceSelector);
  const targetExtraction = extractContent(targetHtml, input.targetUrl, input.targetSelector);

  // 3. Compute text diff
  const textDiff = computeDiff(sourceExtraction.text, targetExtraction.text);

  // 4. Check images
  const imageReport = await checkImages(sourceExtraction.images, targetExtraction.images);

  // 5. Annotate HTML with diff highlights
  const annotatedContent = annotateContent(
    sourceExtraction.contentHtml,
    targetExtraction.contentHtml,
    textDiff.changes,
    imageReport.details,
    sourceExtraction.text,
    targetExtraction.text
  );

  // 6. Calculate overall score (70% text + 30% images)
  const imagePresenceScore =
    imageReport.total === 0 ? 100 : (imageReport.found / imageReport.total) * 100;
  const overallScore =
    Math.round((textDiff.similarity * 0.7 + imagePresenceScore * 0.3) * 10) / 10;

  return {
    source: {
      url: input.sourceUrl,
      title: sourceExtraction.title,
      extractedText: sourceExtraction.text,
      textLength: sourceExtraction.text.split(/\s+/).filter(Boolean).length,
      imageCount: sourceExtraction.images.length,
    },
    target: {
      url: input.targetUrl,
      title: targetExtraction.title,
      extractedText: targetExtraction.text,
      textLength: targetExtraction.text.split(/\s+/).filter(Boolean).length,
      imageCount: targetExtraction.images.length,
    },
    textDiff,
    images: imageReport,
    overallScore,
    annotatedContent,
  };
}
