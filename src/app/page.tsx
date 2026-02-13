'use client';

import CompareForm from '@/components/CompareForm';
import { useComparison } from '@/context/ComparisonContext';

export default function Home() {
  const { isLoading, error } = useComparison();

  return (
    <div className="flex-1 relative bg-black overflow-hidden flex flex-col">
      {/* Static background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 30% 20%, rgba(196,255,71,0.07) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 75% 70%, rgba(196,255,71,0.05) 0%, transparent 60%)' }}
      />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#C4FF47] mb-4 tracking-tight">
            ContentCheck 3000
          </h1>
          <p className="text-white/50 max-w-xl mx-auto text-lg mb-6">
            Enter the source and target URLs to compare their content.
          </p>

          {/* Feature highlights */}
          <div className="flex justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Text Diff
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21zm16.5-13.5h.008v.008h-.008V7.5zm0 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              Image Check
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/60 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Visual Preview
            </span>
          </div>
        </div>

        {/* Form in frosted glass card */}
        <div className="w-full max-w-2xl">
          <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
            <CompareForm />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 w-full max-w-2xl rounded-lg border border-red-500/30 bg-red-500/10 backdrop-blur px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="mt-8 text-center">
            <p className="text-sm text-white/40 mb-4">
              Fetching and comparing pages... This may take a few seconds.
            </p>
            <div className="flex justify-center">
              <div className="relative w-64">
                {/* Glow layer */}
                <div className="absolute -inset-4 rounded-full animate-pulse" style={{ background: 'radial-gradient(circle, rgba(196,255,71,0.25) 0%, transparent 70%)' }} />
                {/* Track */}
                <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[#C4FF47]"
                    style={{ animation: 'loading-slide 1.5s ease-in-out infinite' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
