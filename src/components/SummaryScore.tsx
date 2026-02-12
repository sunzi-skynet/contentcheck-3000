'use client';

import type { ComparisonResult } from '@/lib/types';

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBg(score: number): string {
  if (score >= 90) return 'bg-green-50 border-green-200';
  if (score >= 70) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

function getBarColor(score: number): string {
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function SummaryScore({ result }: { result: ComparisonResult }) {
  const { overallScore, textDiff, images } = result;

  const stats = [
    {
      label: 'Overall Score',
      value: overallScore,
      detail: 'Weighted average of text + images',
    },
    {
      label: 'Text Similarity',
      value: textDiff.similarity,
      detail: `${result.source.textLength} vs ${result.target.textLength} words`,
    },
    {
      label: 'Images Found',
      value: images.total === 0 ? 100 : (images.found / images.total) * 100,
      detail: `${images.found} of ${images.total} images`,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-lg border p-4 ${getScoreBg(stat.value)}`}
        >
          <p className="text-sm font-medium text-gray-600">{stat.label}</p>
          <p className={`text-3xl font-bold ${getScoreColor(stat.value)}`}>
            {Math.round(stat.value * 10) / 10}%
          </p>
          <div className="mt-2 h-2 rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full transition-all ${getBarColor(stat.value)}`}
              style={{ width: `${Math.min(stat.value, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">{stat.detail}</p>
        </div>
      ))}
    </div>
  );
}
