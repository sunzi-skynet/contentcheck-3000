'use client';

import { useHeader } from '@/context/HeaderContext';
import SummaryScore from './SummaryScore';

export default function AppHeader() {
  const { headerData } = useHeader();

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: app name + scores */}
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <a href="/" className="text-lg font-bold text-gray-900 hover:text-blue-600 transition">
                Migration Checker
              </a>
              <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                MVP
              </span>
            </div>

            {headerData && (
              <>
                <span className="text-gray-300 hidden sm:inline">|</span>
                <SummaryScore result={headerData.result} />
              </>
            )}
          </div>

          {/* Right: action button */}
          {headerData?.onCompareAnother ? (
            <button
              onClick={headerData.onCompareAnother}
              className="shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Compare another
            </button>
          ) : headerData?.compareAnotherHref ? (
            <a
              href={headerData.compareAnotherHref}
              className="shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Compare another
            </a>
          ) : null}
        </div>

        {headerData?.metadata && (
          <p className="text-xs text-gray-400 mt-1 ml-0">
            Shared result &middot; Created{' '}
            {new Date(headerData.metadata.createdAt).toLocaleDateString()}{' '}
            &middot; Expires{' '}
            {new Date(headerData.metadata.expiresAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </header>
  );
}
