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
    <div className="py-8">
      <ResultsView
        result={result}
        onCompareAnother={() => router.push('/')}
      />
    </div>
  );
}
