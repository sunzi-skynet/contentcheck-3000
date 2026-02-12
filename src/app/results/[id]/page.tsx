import { notFound } from 'next/navigation';
import { getResultStore, isValidResultId } from '@/lib/result-store';
import ResultsView from '@/components/ResultsView';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SharedResultPage({ params }: Props) {
  const { id } = await params;

  if (!isValidResultId(id)) {
    notFound();
  }

  const store = getResultStore();
  const stored = await store.load(id);

  if (!stored) {
    notFound();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Comparison Results
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Shared result &middot; Created{' '}
            {new Date(stored.metadata.createdAt).toLocaleDateString()}{' '}
            &middot; Expires{' '}
            {new Date(stored.metadata.expiresAt).toLocaleDateString()}
          </p>
        </div>
        <a
          href="/"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
        >
          Compare another
        </a>
      </div>

      <ResultsView result={stored.result} />
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  if (!isValidResultId(id)) return { title: 'Not Found' };

  const store = getResultStore();
  const stored = await store.load(id);
  if (!stored) return { title: 'Not Found' };

  return {
    title: `Migration Check: ${stored.metadata.overallScore}% — ${stored.metadata.sourceUrl}`,
    description: `Comparison between ${stored.metadata.sourceUrl} and ${stored.metadata.targetUrl}`,
  };
}
