'use client';

import { useEffect } from 'react';
import type { ComparisonResult } from '@/lib/types';
import { useHeader } from '@/context/HeaderContext';
import SyncPreviewContainer from './SyncPreviewContainer';
import ImageReport from './ImageReport';

interface ResultsViewProps {
  result: ComparisonResult;
  onCompareAnother?: () => void;
  compareAnotherHref?: string;
  metadata?: {
    createdAt: string;
    expiresAt: string;
  };
}

export default function ResultsView({
  result,
  onCompareAnother,
  compareAnotherHref,
  metadata,
}: ResultsViewProps) {
  const { setHeaderData } = useHeader();

  useEffect(() => {
    setHeaderData({ result, onCompareAnother, compareAnotherHref, metadata });
    return () => setHeaderData(null);
  }, [result, onCompareAnother, compareAnotherHref, metadata, setHeaderData]);

  return (
    <div className="space-y-6">
      {/* Full-width visual preview with sync scroll */}
      <SyncPreviewContainer
        sourceHtml={result.annotatedContent.sourceHtml}
        targetHtml={result.annotatedContent.targetHtml}
        sourceUrl={result.source.url}
        targetUrl={result.target.url}
      />

      {/* Image report in contained width */}
      <div className="max-w-7xl mx-auto px-4">
        <ImageReport report={result.images} />
      </div>
    </div>
  );
}
