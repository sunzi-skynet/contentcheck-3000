'use client';

import type { ComparisonResult } from '@/lib/types';

function getScoreColor(score: number): string {
  if (score >= 90) return 'bg-green-100 text-green-700 border-green-300';
  if (score >= 70) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
  return 'bg-red-100 text-red-700 border-red-300';
}

export default function SummaryScore({ result }: { result: ComparisonResult }) {
  const { overallScore, textDiff, images } = result;
  const imageScore = images.total === 0 ? 100 : (images.found / images.total) * 100;

  const stats = [
    { label: 'Overall', value: `${Math.round(overallScore * 10) / 10}%` },
    { label: 'Text', value: `${Math.round(textDiff.similarity * 10) / 10}%` },
    { label: 'Images', value: `${images.found}/${images.total}` },
  ];

  const scores = [overallScore, textDiff.similarity, imageScore];

  return (
    <div className="flex items-center gap-2">
      {stats.map((stat, i) => (
        <span
          key={stat.label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getScoreColor(scores[i])}`}
        >
          <span className="text-gray-500 font-normal">{stat.label}</span>
          {stat.value}
        </span>
      ))}
    </div>
  );
}
