'use client';

import type { TextDiffResult } from '@/lib/types';

export default function DiffView({ diff }: { diff: TextDiffResult }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Text Diff</h2>
      <div className="rounded-lg border border-gray-200 bg-white p-4 overflow-auto max-h-[600px]">
        <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
          {diff.changes.map((change, i) => {
            if (change.type === 'equal') {
              return (
                <span key={i} className="text-gray-700">
                  {change.value}
                </span>
              );
            }
            if (change.type === 'removed') {
              return (
                <span
                  key={i}
                  className="bg-red-100 text-red-800 line-through decoration-red-400"
                >
                  {change.value}
                </span>
              );
            }
            // added
            return (
              <span key={i} className="bg-green-100 text-green-800">
                {change.value}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
