'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import VisualPreview from './VisualPreview';
import { computeAlignment } from '@/lib/alignment';
import type { BlockMeasurement } from '@/lib/alignment';

interface SyncPreviewContainerProps {
  sourceHtml: string;
  targetHtml: string;
  sourceUrl: string;
  targetUrl: string;
  onSyncStateChange?: (syncEnabled: boolean, toggleSync: () => void) => void;
}

export default function SyncPreviewContainer({
  sourceHtml,
  targetHtml,
  sourceUrl,
  targetUrl,
  onSyncStateChange,
}: SyncPreviewContainerProps) {
  const [syncEnabled, setSyncEnabled] = useState(false);
  const sourceIframeRef = useRef<HTMLIFrameElement | null>(null);
  const targetIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Track pending measurements for alignment computation
  const pendingMeasurements = useRef<{
    source: BlockMeasurement[] | null;
    target: BlockMeasurement[] | null;
  }>({ source: null, target: null });

  // Prevent scroll feedback loops
  const lastScrollRelay = useRef<number>(0);

  // Use a ref for syncEnabled so the message handler always sees the latest value
  const syncEnabledRef = useRef(false);

  const postToIframe = useCallback((iframe: HTMLIFrameElement | null, message: Record<string, unknown>) => {
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(message, '*');
    }
  }, []);

  const handleSourceIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    sourceIframeRef.current = iframe;
  }, []);

  const handleTargetIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    targetIframeRef.current = iframe;
  }, []);

  // Apply alignment once both sides report measurements
  const tryApplyAlignment = useCallback(() => {
    const { source, target } = pendingMeasurements.current;
    if (!source || !target) return;

    console.log('[sync-debug] parent: both measurements received');
    console.log('[sync-debug]   source:', source.length, 'blocks,', source.filter(b => b.isShared).length, 'shared');
    console.log('[sync-debug]   target:', target.length, 'blocks,', target.filter(b => b.isShared).length, 'shared');

    const { sourceSpacers, targetSpacers } = computeAlignment(source, target);

    console.log('[sync-debug]   computed sourceSpacers:', sourceSpacers);
    console.log('[sync-debug]   computed targetSpacers:', targetSpacers);

    postToIframe(sourceIframeRef.current, { type: 'set-spacers', spacers: sourceSpacers });
    postToIframe(targetIframeRef.current, { type: 'set-spacers', spacers: targetSpacers });

    // Reset for next measurement cycle
    pendingMeasurements.current = { source: null, target: null };
  }, [postToIframe]);

  // Listen for messages from iframes — uses refs to avoid stale closures
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || !data.type) return;

      if (data.type === 'block-measurements') {
        console.log('[sync-debug] parent: received block-measurements from', data.sideId, '—', data.blocks?.length, 'blocks');
        if (data.sideId === 'source') {
          pendingMeasurements.current.source = data.blocks;
        } else if (data.sideId === 'target') {
          pendingMeasurements.current.target = data.blocks;
        }
        tryApplyAlignment();
      }

      if (data.type === 'scroll-update' && syncEnabledRef.current) {
        const now = Date.now();
        if (now - lastScrollRelay.current < 50) return;
        lastScrollRelay.current = now;

        if (data.sideId === 'source') {
          postToIframe(targetIframeRef.current, { type: 'scroll-to', scrollTop: data.scrollTop });
        } else if (data.sideId === 'target') {
          postToIframe(sourceIframeRef.current, { type: 'scroll-to', scrollTop: data.scrollTop });
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [postToIframe, tryApplyAlignment]);

  const enableSync = useCallback(() => {
    setSyncEnabled(true);
    syncEnabledRef.current = true;

    // Tell each iframe its identity and enable sync
    postToIframe(sourceIframeRef.current, { type: 'sync-enable', sideId: 'source' });
    postToIframe(targetIframeRef.current, { type: 'sync-enable', sideId: 'target' });

    // Request block measurements after sync-enable is processed
    setTimeout(() => {
      postToIframe(sourceIframeRef.current, { type: 'measure-blocks' });
      postToIframe(targetIframeRef.current, { type: 'measure-blocks' });
    }, 50);
  }, [postToIframe]);

  const disableSync = useCallback(() => {
    setSyncEnabled(false);
    syncEnabledRef.current = false;

    postToIframe(sourceIframeRef.current, { type: 'sync-disable' });
    postToIframe(targetIframeRef.current, { type: 'sync-disable' });
    postToIframe(sourceIframeRef.current, { type: 'clear-spacers' });
    postToIframe(targetIframeRef.current, { type: 'clear-spacers' });
  }, [postToIframe]);

  const toggleSync = useCallback(() => {
    if (syncEnabledRef.current) {
      disableSync();
    } else {
      enableSync();
    }
  }, [enableSync, disableSync]);

  // Notify parent of sync state changes
  useEffect(() => {
    onSyncStateChange?.(syncEnabled, toggleSync);
  }, [syncEnabled, toggleSync, onSyncStateChange]);

  return (
    <div className="w-full px-4">
      {/* Side-by-side previews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VisualPreview
          label="Source"
          annotatedHtml={sourceHtml}
          url={sourceUrl}
          defaultHighlightMode="not-migrated"
          onIframeRef={handleSourceIframeRef}
        />
        <VisualPreview
          label="Target"
          annotatedHtml={targetHtml}
          url={targetUrl}
          defaultHighlightMode="migrated"
          onIframeRef={handleTargetIframeRef}
        />
      </div>
    </div>
  );
}
