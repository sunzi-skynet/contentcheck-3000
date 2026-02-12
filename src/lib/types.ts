export interface PageData {
  url: string;
  title: string;
  extractedText: string;
  textLength: number;
  imageCount: number;
}

export interface DiffChange {
  type: 'equal' | 'added' | 'removed';
  value: string;
}

export interface TextDiffResult {
  similarity: number;
  changes: DiffChange[];
}

export interface ImageInfo {
  src: string;
  alt: string;
}

export interface ImageDetail {
  src: string;
  alt: string;
  status: 'found' | 'missing' | 'unverified';
  matchMethod?: 'exact-url' | 'filename' | 'normalized-filename' | 'content-hash' | 'alt-text';
  targetMatch?: string;
}

export interface ImageReport {
  total: number;
  found: number;
  missing: number;
  details: ImageDetail[];
}

export interface ExtractionResult {
  title: string;
  text: string;
  images: ImageInfo[];
}

export interface ComparisonResult {
  source: PageData;
  target: PageData;
  textDiff: TextDiffResult;
  images: ImageReport;
  overallScore: number;
}

export interface ComparisonRequest {
  sourceUrl: string;
  targetUrl: string;
  sourceSelector?: string | null;
  targetSelector?: string | null;
}

export interface ApiError {
  error: string;
  code: string;
  details?: string;
}
