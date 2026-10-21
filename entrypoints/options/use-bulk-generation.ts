import { browser } from '#imports';
import { useEffect, useState } from 'react';
import { BULK_GENERATION_KEY, isBulkGenerationActive } from '@/lib/bulk-generation';
import type { BulkGeneration, ExtensionMessage, MessageResponse } from '@/lib/types';

export function useBulkGeneration() {
  const [batch, setBatch] = useState<BulkGeneration>();
  useEffect(() => {
    let active = true;
    let revision = 0;
    let busy = false;
    async function refresh() {
      const current = ++revision;
      const response = (await browser.runtime.sendMessage({
        type: 'GET_BULK_GENERATION',
      } satisfies ExtensionMessage)) as MessageResponse;
      if (active && current === revision && response?.ok) {
        busy = isBulkGenerationActive(response.batch);
        setBatch(response.batch);
      }
    }
    function changed(changes: Record<string, unknown>, area: string) {
      if (area === 'session' && BULK_GENERATION_KEY in changes) void refresh().catch(() => undefined);
    }
    browser.storage.onChanged.addListener(changed);
    void refresh().catch(() => undefined);
    // Detect a restarted background even if the library stays open during suspension.
    const interval = window.setInterval(() => {
      if (busy) void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
      browser.storage.onChanged.removeListener(changed);
    };
  }, []);
  const expired = batch && batch.expiresAt <= Date.now() && isBulkGenerationActive(batch);
  return expired
    ? {
        ...batch,
        items: batch.items.map((item) => ({
          ...item,
          state: item.state === 'queued' || item.state === 'pending' ? ('failed' as const) : item.state,
        })),
      }
    : batch;
}
