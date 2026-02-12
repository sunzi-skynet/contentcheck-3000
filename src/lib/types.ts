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
  contentHtml: string;
}

export interface AnnotatedContent {
  sourceHtml: string;
  targetHtml: string;
}

export interface ComparisonResult {
  source: PageData;
  target: PageData;
  textDiff: TextDiffResult;
  images: ImageReport;
  overallScore: number;
  annotatedContent: AnnotatedContent;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface ComparisonRequest {
  sourceUrl: string;
  targetUrl: string;
  sourceSelector?: string | null;
  targetSelector?: string | null;
  sourceAuth?: AuthCredentials | null;
  targetAuth?: AuthCredentials | null;
}

export interface ApiError {
  error: string;
  code: string;
  details?: string;
}

/** Lean API response for headless/machine consumers */
export interface HeadlessApiResponse {
  resultId: string;
  resultUrl: string;
  overallScore: number;
  text: {
    score: number;
    missedContent: string[];
  };
  images: {
    score: number;
    total: number;
    found: number;
    missing: number;
    missedImages: ImageDetail[];
  };
}
