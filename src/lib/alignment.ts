export interface BlockMeasurement {
  idx: number;
  top: number;
  height: number;
  isShared: boolean;
  text: string;
}

export interface AlignmentResult {
  sourceSpacers: Record<number, number>;
  targetSpacers: Record<number, number>;
}

/**
 * Normalize block text for matching: lowercase, collapse whitespace, trim.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Compute spacer heights to align matching content blocks between source and target.
 *
 * Shared blocks are matched by **text content** — not sequential position.
 * For each shared source block, we find the first unmatched shared target block
 * with matching normalized text, preserving document order on both sides.
 *
 * Uses the actual measured `top` positions of each block, so margins, padding, and
 * other inter-block spacing are correctly accounted for.
 *
 * For each matched pair, the side whose block is higher gets a spacer inserted
 * before the block to push it down to match the other side.
 */
export function computeAlignment(
  sourceBlocks: BlockMeasurement[],
  targetBlocks: BlockMeasurement[]
): AlignmentResult {
  const sourceSpacers: Record<number, number> = {};
  const targetSpacers: Record<number, number> = {};

  if (sourceBlocks.length === 0 || targetBlocks.length === 0) {
    return { sourceSpacers, targetSpacers };
  }

  // Extract shared blocks from each side in document order
  const sharedSource = sourceBlocks.filter(b => b.isShared);
  const sharedTarget = targetBlocks.filter(b => b.isShared);

  // Match shared blocks by text content, preserving order on both sides.
  // For each source shared block, find the earliest unmatched target shared block
  // with matching text. This is a greedy forward scan that respects document order.
  const matched: Array<{ source: BlockMeasurement; target: BlockMeasurement }> = [];
  let targetSearchStart = 0;

  for (const sb of sharedSource) {
    const sbText = normalizeText(sb.text);
    if (!sbText) continue;

    for (let j = targetSearchStart; j < sharedTarget.length; j++) {
      const tbText = normalizeText(sharedTarget[j].text);
      if (sbText === tbText) {
        matched.push({ source: sb, target: sharedTarget[j] });
        targetSearchStart = j + 1; // advance past this match
        break;
      }
    }
  }

  // Track cumulative spacer offsets — each spacer shifts all subsequent blocks
  let sourceCumulativeSpacer = 0;
  let targetCumulativeSpacer = 0;

  for (const { source: sb, target: tb } of matched) {
    // Effective position = measured position + all previously inserted spacers
    const effectiveSourceTop = sb.top + sourceCumulativeSpacer;
    const effectiveTargetTop = tb.top + targetCumulativeSpacer;

    const diff = effectiveSourceTop - effectiveTargetTop;
    if (diff > 0) {
      // Target block is too high — push it down
      targetSpacers[tb.idx] = diff;
      targetCumulativeSpacer += diff;
    } else if (diff < 0) {
      // Source block is too high — push it down
      sourceSpacers[sb.idx] = -diff;
      sourceCumulativeSpacer += -diff;
    }
  }

  return { sourceSpacers, targetSpacers };
}
