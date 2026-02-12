'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useComparison } from '@/context/ComparisonContext';
import SummaryScore from '@/components/SummaryScore';
import DiffView from '@/components/DiffView';
import ImageReport from '@/components/ImageReport';
import ContentPreview from '@/components/ContentPreview';

export default function ResultsPage() {
  const router = useRouter();
  const { result } = useComparison();

  useEffect(() => {
    if (!result) {
      router.replace('/');
    }
  }, [result, router]);

  if (!result) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Comparison Results
        </h1>
        <button
          onClick={() => router.push('/')}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
        >
          Compare another
        </button>
      </div>

      <SummaryScore result={result} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ContentPreview
          label="Source"
          title={result.source.title}
          url={result.source.url}
          text={result.source.extractedText}
          wordCount={result.source.textLength}
        />
        <ContentPreview
          label="Target"
          title={result.target.title}
          url={result.target.url}
          text={result.target.extractedText}
          wordCount={result.target.textLength}
        />
      </div>

      <DiffView diff={result.textDiff} />

      <ImageReport report={result.images} />
    </div>
  );
}
