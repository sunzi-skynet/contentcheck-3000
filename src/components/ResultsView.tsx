'use client';

import type { ComparisonResult } from '@/lib/types';
import SummaryScore from './SummaryScore';
import VisualPreview from './VisualPreview';
import ImageReport from './ImageReport';

export default function ResultsView({ result }: { result: ComparisonResult }) {
  return (
    <>
      <SummaryScore result={result} />

      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Visual Content Preview
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <VisualPreview
            label="Source"
            annotatedHtml={result.annotatedContent.sourceHtml}
            url={result.source.url}
          />
          <VisualPreview
            label="Target"
            annotatedHtml={result.annotatedContent.targetHtml}
            url={result.target.url}
          />
        </div>
      </div>

      <ImageReport report={result.images} />
    </>
  );
}
