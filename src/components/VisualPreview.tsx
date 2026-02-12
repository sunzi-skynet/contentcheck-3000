'use client';

import { useState, useRef, useCallback } from 'react';

interface VisualPreviewProps {
  label: string;
  annotatedHtml: string;
  url: string;
  defaultHighlightMode?: 'migrated' | 'not-migrated';
}

export default function VisualPreview({
  label,
  annotatedHtml,
  url,
  defaultHighlightMode = 'migrated',
}: VisualPreviewProps) {
  const [highlightMode, setHighlightMode] = useState<'migrated' | 'not-migrated'>(defaultHighlightMode);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendToggle = useCallback((mode: 'migrated' | 'not-migrated') => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'toggle-highlight', mode },
        '*'
      );
    }
  }, []);

  const handleToggle = useCallback((mode: 'migrated' | 'not-migrated') => {
    setHighlightMode(mode);
    sendToggle(mode);
  }, [sendToggle]);

  const handleIframeLoad = useCallback(() => {
    // Send current mode when iframe finishes loading
    sendToggle(highlightMode);
  }, [sendToggle, highlightMode]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{label}</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline truncate max-w-xs"
            >
              {url}
            </a>
          </div>

          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            <button
              type="button"
              onClick={() => handleToggle('migrated')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                highlightMode === 'migrated'
                  ? 'bg-green-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Migrated
            </button>
            <button
              type="button"
              onClick={() => handleToggle('not-migrated')}
              className={`px-3 py-1.5 text-xs font-medium border-l border-gray-300 transition-colors ${
                highlightMode === 'not-migrated'
                  ? 'bg-red-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Not Migrated
            </button>
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: '600px' }}>
        <iframe
          ref={iframeRef}
          srcDoc={annotatedHtml}
          sandbox="allow-scripts"
          onLoad={handleIframeLoad}
          className="w-full h-full border-0 rounded-b-lg"
          title={`${label} preview`}
        />
      </div>
    </div>
  );
}
