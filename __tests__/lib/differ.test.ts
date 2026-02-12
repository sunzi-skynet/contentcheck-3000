import { describe, it, expect } from 'vitest';
import { computeDiff } from '@/lib/differ';

describe('computeDiff', () => {
  it('returns 100% similarity for identical texts', () => {
    const result = computeDiff('Hello world', 'Hello world');
    expect(result.similarity).toBe(100);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe('equal');
  });

  it('returns 0% similarity for completely different texts', () => {
    const result = computeDiff('Hello world', 'Goodbye universe');
    expect(result.similarity).toBe(0);
  });

  it('detects added text', () => {
    const result = computeDiff('Hello', 'Hello world');
    const added = result.changes.filter((c) => c.type === 'added');
    expect(added.length).toBeGreaterThan(0);
    expect(result.similarity).toBeLessThan(100);
  });

  it('detects removed text', () => {
    const result = computeDiff('Hello world', 'Hello');
    const removed = result.changes.filter((c) => c.type === 'removed');
    expect(removed.length).toBeGreaterThan(0);
    expect(result.similarity).toBeLessThan(100);
  });

  it('handles empty strings', () => {
    const result = computeDiff('', '');
    expect(result.similarity).toBe(100);
  });

  it('handles one empty string', () => {
    const result = computeDiff('Hello world', '');
    expect(result.similarity).toBe(0);
  });

  it('calculates partial similarity correctly', () => {
    const result = computeDiff(
      'The quick brown fox jumps over the lazy dog',
      'The quick brown cat jumps over the lazy dog'
    );
    // 8 of 9 words match → ~88.9%
    expect(result.similarity).toBeGreaterThan(80);
    expect(result.similarity).toBeLessThan(100);
  });
});
