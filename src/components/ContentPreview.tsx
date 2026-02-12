'use client';

import { useState } from 'react';

interface ContentPreviewProps {
  label: string;
  title: string;
  url: string;
  text: string;
  wordCount: number;
}

export default function ContentPreview({
  label,
  title,
  url,
  text,
  wordCount,
}: ContentPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition"
      >
        <div>
          <span className="text-sm font-medium text-gray-900">{label}</span>
          <span className="ml-2 text-xs text-gray-500">
            {title} ({wordCount} words)
          </span>
        </div>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isExpanded && (
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {url}
            </a>
          </p>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono max-h-[400px] overflow-auto">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}
