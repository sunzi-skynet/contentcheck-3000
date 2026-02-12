'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useComparison } from '@/context/ComparisonContext';
import ResultsView from '@/components/ResultsView';

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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
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

      <ResultsView result={result} />
    </div>
  );
}
