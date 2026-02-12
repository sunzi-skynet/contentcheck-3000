'use client';

import CompareForm from '@/components/CompareForm';
import { useComparison } from '@/context/ComparisonContext';

export default function Home() {
  const { isLoading, error } = useComparison();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Compare Migration Pages
        </h1>
        <p className="text-gray-600 max-w-xl mx-auto">
          Enter the source (original) and target (migrated) URLs to compare
          their content. We&apos;ll extract the main content area, show you a
          text diff, and check which images made it to the new page.
        </p>
      </div>

      <div className="flex justify-center">
        <CompareForm />
      </div>

      {error && (
        <div className="mt-6 max-w-2xl mx-auto rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {isLoading && (
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Fetching and comparing pages... This may take a few seconds.
          </p>
          <div className="mt-3 flex justify-center">
            <div className="h-2 w-48 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full w-1/2 rounded-full bg-blue-500 animate-pulse" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
