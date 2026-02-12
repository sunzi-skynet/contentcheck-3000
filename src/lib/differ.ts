import { diffWords } from 'diff';
import type { TextDiffResult, DiffChange } from './types';

const MAX_WORDS = 50_000;

function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ');
}

export function computeDiff(sourceText: string, targetText: string): TextDiffResult {
  // Cap input length to prevent CPU exhaustion
  const cappedSource = truncateToWords(sourceText, MAX_WORDS);
  const cappedTarget = truncateToWords(targetText, MAX_WORDS);

  const rawDiff = diffWords(cappedSource, cappedTarget);

  const changes: DiffChange[] = [];
  let unchangedWords = 0;
  let sourceWordCount = 0;
  let targetWordCount = 0;

  for (const part of rawDiff) {
    const wordCount = part.value.split(/\s+/).filter(Boolean).length;

    if (part.added) {
      changes.push({ type: 'added', value: part.value });
      targetWordCount += wordCount;
    } else if (part.removed) {
      changes.push({ type: 'removed', value: part.value });
      sourceWordCount += wordCount;
    } else {
      changes.push({ type: 'equal', value: part.value });
      unchangedWords += wordCount;
      sourceWordCount += wordCount;
      targetWordCount += wordCount;
    }
  }

  const maxWordCount = Math.max(sourceWordCount, targetWordCount);
  const similarity = maxWordCount === 0 ? 100 : (unchangedWords / maxWordCount) * 100;

  return {
    similarity: Math.round(similarity * 10) / 10,
    changes,
  };
}
