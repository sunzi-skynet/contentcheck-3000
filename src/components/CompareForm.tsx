'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useComparison } from '@/context/ComparisonContext';

export default function CompareForm() {
  const router = useRouter();
  const { setResult, setIsLoading, setError, isLoading } = useComparison();
  const [sourceUrl, setSourceUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sourceSelector, setSourceSelector] = useState('');
  const [targetSelector, setTargetSelector] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          targetUrl,
          sourceSelector: sourceSelector || null,
          targetSelector: targetSelector || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        setIsLoading(false);
        return;
      }

      setResult(data);
      setIsLoading(false);
      router.push('/results');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6">
      <div>
        <label
          htmlFor="sourceUrl"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Source URL (original page)
        </label>
        <input
          id="sourceUrl"
          type="url"
          required
          placeholder="https://old-site.com/about"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
          disabled={isLoading}
        />
      </div>

      <div>
        <label
          htmlFor="targetUrl"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Target URL (migrated page)
        </label>
        <input
          id="targetUrl"
          type="url"
          required
          placeholder="https://new-site.com/about-us"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
          disabled={isLoading}
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced options
        </button>
      </div>

      {showAdvanced && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            Override the automatic content detection with a CSS selector. Only
            tag names, class selectors (.class), and ID selectors (#id) are
            allowed.
          </p>
          <div>
            <label
              htmlFor="sourceSelector"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Source CSS selector (optional)
            </label>
            <input
              id="sourceSelector"
              type="text"
              placeholder="#content"
              value={sourceSelector}
              onChange={(e) => setSourceSelector(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
              disabled={isLoading}
            />
          </div>
          <div>
            <label
              htmlFor="targetSelector"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Target CSS selector (optional)
            </label>
            <input
              id="targetSelector"
              type="text"
              placeholder=".article-body"
              value={targetSelector}
              onChange={(e) => setTargetSelector(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
              disabled={isLoading}
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Comparing pages...
          </span>
        ) : (
          'Compare'
        )}
      </button>
    </form>
  );
}
