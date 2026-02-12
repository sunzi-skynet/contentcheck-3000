import { describe, it, expect } from 'vitest';
import { computeAlignment } from '../../src/lib/alignment';
import type { BlockMeasurement } from '../../src/lib/alignment';

function block(idx: number, top: number, height: number, isShared: boolean, text = `block-${idx}`): BlockMeasurement {
  return { idx, top, height, isShared, text };
}

describe('computeAlignment', () => {
  it('returns empty spacers when both sides are empty', () => {
    const result = computeAlignment([], []);
    expect(result.sourceSpacers).toEqual({});
    expect(result.targetSpacers).toEqual({});
  });

  it('returns empty spacers when one side is empty', () => {
    const source = [block(0, 0, 100, true)];
    const result = computeAlignment(source, []);
    expect(result.sourceSpacers).toEqual({});
    expect(result.targetSpacers).toEqual({});
  });

  it('returns empty spacers when all blocks are already aligned', () => {
    const source = [block(0, 0, 100, true, 'A'), block(1, 100, 50, true, 'B')];
    const target = [block(0, 0, 100, true, 'A'), block(1, 100, 50, true, 'B')];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({});
    expect(result.targetSpacers).toEqual({});
  });

  it('adds spacer to target when source has extra block before a match', () => {
    const source = [
      block(0, 0, 100, true, 'A'),
      block(1, 100, 50, false, 'unique'),
      block(2, 150, 80, true, 'B'),
    ];
    const target = [
      block(0, 0, 100, true, 'A'),
      block(1, 100, 80, true, 'B'),
    ];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({});
    expect(result.targetSpacers).toEqual({ 1: 50 });
  });

  it('adds spacer to source when target has extra block before a match', () => {
    const source = [
      block(0, 0, 100, true, 'A'),
      block(1, 100, 80, true, 'B'),
    ];
    const target = [
      block(0, 0, 100, true, 'A'),
      block(1, 100, 60, false, 'unique'),
      block(2, 160, 80, true, 'B'),
    ];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({ 1: 60 });
    expect(result.targetSpacers).toEqual({});
  });

  it('handles both sides having unique blocks', () => {
    const source = [
      block(0, 0, 100, true, 'A'),
      block(1, 100, 30, false, 'src-only'),
      block(2, 130, 80, true, 'B'),
    ];
    const target = [
      block(0, 0, 100, true, 'A'),
      block(1, 100, 50, false, 'tgt-only'),
      block(2, 150, 80, true, 'B'),
    ];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({ 2: 20 });
    expect(result.targetSpacers).toEqual({});
  });

  it('handles matched blocks with different heights', () => {
    const source = [
      block(0, 0, 100, true, 'A'),
      block(1, 100, 50, true, 'B'),
    ];
    const target = [
      block(0, 0, 120, true, 'A'),
      block(1, 120, 50, true, 'B'),
    ];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({ 1: 20 });
    expect(result.targetSpacers).toEqual({});
  });

  it('handles all blocks being unique (no matches)', () => {
    const source = [block(0, 0, 100, false, 'X'), block(1, 100, 50, false, 'Y')];
    const target = [block(0, 0, 80, false, 'P'), block(1, 80, 60, false, 'Q')];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({});
    expect(result.targetSpacers).toEqual({});
  });

  it('handles multiple alignment corrections across many blocks', () => {
    const source = [
      block(0, 0, 50, true, 'A'),
      block(1, 50, 100, false, 'src-only'),
      block(2, 150, 50, true, 'B'),
      block(3, 200, 50, true, 'C'),
    ];
    const target = [
      block(0, 0, 50, true, 'A'),
      block(1, 50, 50, true, 'B'),
      block(2, 100, 80, false, 'tgt-only'),
      block(3, 180, 50, true, 'C'),
    ];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({ 3: 80 });
    expect(result.targetSpacers).toEqual({ 1: 100 });
  });

  it('handles single shared block on each side', () => {
    const source = [block(0, 0, 100, true, 'A')];
    const target = [block(0, 0, 100, true, 'A')];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({});
    expect(result.targetSpacers).toEqual({});
  });

  it('handles uneven shared block counts (extra unmatched shared blocks)', () => {
    const source = [
      block(0, 0, 50, true, 'A'),
      block(1, 50, 50, true, 'B'),
      block(2, 100, 50, true, 'C'),
    ];
    const target = [
      block(0, 0, 50, true, 'A'),
      block(1, 50, 50, true, 'B'),
    ];
    const result = computeAlignment(source, target);
    expect(result.sourceSpacers).toEqual({});
    expect(result.targetSpacers).toEqual({});
  });

  // --- Text-based matching tests ---

  it('matches blocks by text, not sequential position', () => {
    // Source shared: A, B, C
    // Target shared: A, X, B, C  (X is shared on target but not on source)
    // Sequential matching would pair B↔X (wrong). Text matching pairs A↔A, B↔B, C↔C.
    const source = [
      block(0, 0, 50, true, 'Alpha paragraph'),
      block(1, 50, 50, true, 'Beta paragraph'),
      block(2, 100, 50, true, 'Gamma paragraph'),
    ];
    const target = [
      block(0, 0, 50, true, 'Alpha paragraph'),
      block(1, 50, 50, true, 'Extra target-only paragraph'),
      block(2, 100, 50, true, 'Beta paragraph'),
      block(3, 150, 50, true, 'Gamma paragraph'),
    ];
    const result = computeAlignment(source, target);
    // A↔A: both at 0, aligned. B↔B: source=50, target=100 → source +50.
    // After source spacer: C effective source=100+50=150, target=150 → aligned.
    expect(result.sourceSpacers).toEqual({ 1: 50 });
    expect(result.targetSpacers).toEqual({});
  });

  it('skips unmatched shared blocks without corrupting later matches', () => {
    // Source has a shared block Z that target doesn't have
    const source = [
      block(0, 0, 50, true, 'A'),
      block(1, 50, 50, true, 'Z'),   // no match on target
      block(2, 100, 50, true, 'B'),
    ];
    const target = [
      block(0, 0, 50, true, 'A'),
      block(1, 50, 50, true, 'B'),
    ];
    const result = computeAlignment(source, target);
    // A↔A at 0. Z has no match — skipped. B↔B: source=100, target=50 → target +50.
    expect(result.sourceSpacers).toEqual({});
    expect(result.targetSpacers).toEqual({ 1: 50 });
  });

  it('matches case-insensitively and ignores whitespace differences', () => {
    const source = [block(0, 0, 50, true, '  Hello   World  ')];
    const target = [block(0, 50, 50, true, 'hello world')];
    const result = computeAlignment(source, target);
    // Text normalizes to same string → matched. Source at 0, target at 50 → source +50.
    expect(result.sourceSpacers).toEqual({ 0: 50 });
    expect(result.targetSpacers).toEqual({});
  });

  it('handles interleaved shared/unshared blocks with text matching', () => {
    // Real-world scenario: same content but different isShared classification
    const source = [
      block(0, 0, 30, true, 'Title'),
      block(1, 30, 50, false, 'Source-only intro'),
      block(2, 80, 40, true, 'Shared middle'),
      block(3, 120, 60, true, 'Conclusion'),
    ];
    const target = [
      block(0, 0, 30, true, 'Title'),
      block(1, 30, 40, true, 'Shared middle'),
      block(2, 70, 50, false, 'Target-only bridge'),
      block(3, 120, 60, true, 'Conclusion'),
    ];
    const result = computeAlignment(source, target);
    // Title↔Title: both at 0. Shared middle: src=80, tgt=30 → tgt +50.
    // After tgt spacer: Conclusion: src=120, tgt=120+50=170 → src +50.
    expect(result.targetSpacers).toEqual({ 1: 50 });
    expect(result.sourceSpacers).toEqual({ 3: 50 });
  });
});
