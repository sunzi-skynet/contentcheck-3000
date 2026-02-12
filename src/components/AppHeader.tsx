'use client';

import { useHeader } from '@/context/HeaderContext';
import SummaryScore from './SummaryScore';

export default function AppHeader() {
  const { headerData } = useHeader();

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Left: app name + metadata + scores */}
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <a href="/" className="text-lg font-bold text-gray-900 hover:text-blue-600 transition">
                Migration Checker
              </a>
              <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                MVP
              </span>
            </div>

            {headerData?.metadata && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Shared &middot; {new Date(headerData.metadata.createdAt).toLocaleDateString()}
                {' '}&ndash;{' '}
                {new Date(headerData.metadata.expiresAt).toLocaleDateString()}
              </span>
            )}

            {headerData && (
              <>
                <span className="text-gray-300 hidden sm:inline">|</span>
                <SummaryScore result={headerData.result} />
              </>
            )}
          </div>

          {/* Right: sync scroll + action button */}
          <div className="flex items-center gap-2 shrink-0">
            {headerData?.onToggleSync && (
              <button
                onClick={headerData.onToggleSync}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  headerData.syncEnabled
                    ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {headerData.syncEnabled ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                    />
                  )}
                </svg>
                <span className="hidden sm:inline">{headerData.syncEnabled ? 'Sync On' : 'Sync Scroll'}</span>
              </button>
            )}
            {headerData?.onCompareAnother ? (
              <button
                onClick={headerData.onCompareAnother}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                Compare another
              </button>
            ) : headerData?.compareAnotherHref ? (
              <a
                href={headerData.compareAnotherHref}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                Compare another
              </a>
            ) : null}
          </div>
        </div>

      </div>
    </header>
  );
}
