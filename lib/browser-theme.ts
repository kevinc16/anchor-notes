import { browser } from '#imports';
import { normalizeSettings } from './settings';
import { readData } from './storage';
import { resolveTheme, type ResolvedTheme } from './theme';
import type { ThemePreference } from './types';

// Subscribe before reading so an older startup snapshot cannot undo a live change.
export function watchTheme(apply: (theme: ResolvedTheme) => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference: ThemePreference = 'system';
  let changed = false;
  let stopped = false;
  const refresh = () => apply(resolveTheme(preference, media.matches));
  const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !changes.anchorNotesData) return;
    changed = true;
    const data = changes.anchorNotesData.newValue as { settings?: unknown } | undefined;
    preference = normalizeSettings(data?.settings).theme;
    refresh();
  };
  browser.storage.onChanged.addListener(onChanged);
  media.addEventListener('change', refresh);
  refresh();
  void readData()
    .then((data) => {
      if (stopped || changed) return;
      preference = data.settings.theme;
      refresh();
    })
    .catch(() => undefined); // System remains usable if extension storage is unavailable.
  return () => {
    stopped = true;
    browser.storage.onChanged.removeListener(onChanged);
    media.removeEventListener('change', refresh);
  };
}
