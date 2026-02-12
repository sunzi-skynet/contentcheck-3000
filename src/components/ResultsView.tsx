'use client';

import { useEffect } from 'react';
import type { ComparisonResult } from '@/lib/types';
import { useHeader } from '@/context/HeaderContext';
import VisualPreview from './VisualPreview';
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
      {/* Full-width visual preview */}
      <div className="w-full px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <VisualPreview
            label="Source"
            annotatedHtml={result.annotatedContent.sourceHtml}
            url={result.source.url}
            defaultHighlightMode="not-migrated"
          />
          <VisualPreview
            label="Target"
            annotatedHtml={result.annotatedContent.targetHtml}
            url={result.target.url}
            defaultHighlightMode="migrated"
          />
        </div>
      </div>

      {/* Image report in contained width */}
      <div className="max-w-7xl mx-auto px-4">
        <ImageReport report={result.images} />
      </div>
    </div>
  );
}
