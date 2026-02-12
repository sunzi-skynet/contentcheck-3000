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
    <div className="py-8">
      <ResultsView
        result={stored.result}
        compareAnotherHref="/"
        metadata={{
          createdAt: stored.metadata.createdAt,
          expiresAt: stored.metadata.expiresAt,
        }}
      />
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
