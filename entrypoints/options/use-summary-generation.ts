import { browser } from '#imports';
import { useEffect, useState } from 'react';
import { getSummaryGenerationState, SUMMARY_GENERATION_PREFIX } from '@/lib/summary-generation';
import type { SummaryGenerationStatus } from '@/lib/types';

export function useSummaryGeneration() {
  const [statuses, setStatuses] = useState<Record<string, SummaryGenerationStatus>>({});
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      const snapshot = await browser.storage.session.get(null);
      if (!active || current !== revision) return;
      setStatuses(
        Object.fromEntries(
          Object.entries(snapshot)
            .filter(([key, value]) => key.startsWith(SUMMARY_GENERATION_PREFIX) && getSummaryGenerationState(value))
            .map(([key, value]) => [key.slice(SUMMARY_GENERATION_PREFIX.length), value as SummaryGenerationStatus]),
        ),
      );
      setNow(Date.now());
    }
    function onChanged(changes: Record<string, unknown>, area: string) {
      if (area === 'session' && Object.keys(changes).some((key) => key.startsWith(SUMMARY_GENERATION_PREFIX))) {
        void refresh().catch(() => undefined);
      }
    }
    browser.storage.onChanged.addListener(onChanged);
    void refresh().catch(() => undefined);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  useEffect(() => {
    const deadlines = Object.values(statuses)
      .filter((status) => status.state === 'pending' && status.expiresAt > now)
      .map((status) => (status.state === 'pending' ? status.expiresAt : Infinity));
    if (!deadlines.length) return;
    const timeout = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...deadlines) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [statuses, now]);

  return Object.fromEntries(
    Object.entries(statuses).map(([id, status]) => [id, getSummaryGenerationState(status, now)]),
  );
}
