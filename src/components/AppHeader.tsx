'use client';

import { useHeader } from '@/context/HeaderContext';
import SummaryScore from './SummaryScore';

export default function AppHeader() {
  const { headerData } = useHeader();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur supports-[backdrop-filter]:bg-black/70">
      <div className="mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          {/* Left: app name + metadata + scores */}
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <a href="/" className="text-lg font-bold text-[#C4FF47] hover:text-[#d4ff6a] transition">
                ContentCheck 3000
              </a>
              <span className="text-xs text-white/60 border border-white/20 rounded px-1.5 py-0.5">
                v0.1.0
              </span>
            </div>

            {headerData?.metadata && (
              <span className="text-xs text-white/40 hidden sm:inline">
                Shared &middot; {new Date(headerData.metadata.createdAt).toLocaleDateString()}
                {' '}&ndash;{' '}
                {new Date(headerData.metadata.expiresAt).toLocaleDateString()}
              </span>
            )}

            {headerData && (
              <>
                <span className="text-white/20 hidden sm:inline">|</span>
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
                    ? 'bg-[#C4FF47] text-black border-[#C4FF47] hover:bg-[#d4ff6a]'
                    : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/15'
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
                <span className="hidden sm:inline">{headerData.syncEnabled ? 'Scroll Sync On' : 'Scroll Sync'}</span>
              </button>
            )}
            {headerData?.onCompareAnother ? (
              <button
                onClick={headerData.onCompareAnother}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
              >
                Compare another
              </button>
            ) : headerData?.compareAnotherHref ? (
              <a
                href={headerData.compareAnotherHref}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition"
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
