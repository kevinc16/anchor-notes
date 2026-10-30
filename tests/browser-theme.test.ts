import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/settings';
import type { AnchorData } from '../lib/types';

const io = vi.hoisted(() => ({
  listeners: new Set<(changes: Record<string, { newValue?: unknown }>, area: string) => void>(),
  read: vi.fn<() => Promise<AnchorData>>(),
}));
vi.mock('#imports', () => ({
  browser: {
    storage: {
      onChanged: {
        addListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) =>
          io.listeners.add(listener),
        removeListener: (listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void) =>
          io.listeners.delete(listener),
      },
    },
  },
}));
vi.mock('../lib/storage', () => ({ readData: () => io.read() }));
import { watchTheme } from '../lib/browser-theme';

let media: EventTarget & { matches: boolean };
let stop: (() => void) | undefined;
beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('window', { matchMedia: () => media });
  io.listeners.clear();
  io.read.mockReset().mockResolvedValue({ schemaVersion: 1, notes: [], settings: DEFAULT_SETTINGS });
});
afterEach(() => {
  stop?.();
  vi.unstubAllGlobals();
});
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
function stored(theme: unknown) {
  for (const listener of io.listeners) listener({ anchorNotesData: { newValue: { settings: { theme } } } }, 'local');
}

it('follows live OS changes only for System and normalizes storage deletion', async () => {
  let current = '';
  stop = watchTheme((theme) => {
    current = theme;
  });
  await flush();
  expect(current).toBe('light');
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  expect(current).toBe('dark');
  stored('light');
  media.dispatchEvent(new Event('change'));
  expect(current).toBe('light');
  stored(undefined);
  expect(current).toBe('dark');
});

it('does not overwrite a newer storage event with an older initial read', async () => {
  let finish!: (data: AnchorData) => void;
  io.read.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let current = '';
  stop = watchTheme((theme) => {
    current = theme;
  });
  stored('dark');
  finish({ schemaVersion: 1, notes: [], settings: DEFAULT_SETTINGS });
  await flush();
  expect(current).toBe('dark');
});

it('keeps System usable when reading storage fails', async () => {
  io.read.mockRejectedValue(new Error('storage unavailable'));
  let current = '';
  stop = watchTheme((theme) => {
    current = theme;
  });
  await flush();
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  expect(current).toBe('dark');
});

it('stops media, storage and pending initial updates on cleanup', async () => {
  let finish!: (data: AnchorData) => void;
  io.read.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let current = '';
  stop = watchTheme((theme) => {
    current = theme;
  });
  stop();
  finish({ schemaVersion: 1, notes: [], settings: { ...DEFAULT_SETTINGS, theme: 'dark' } });
  stored('dark');
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  await flush();
  expect(current).toBe('light');
  expect(io.listeners.size).toBe(0);
});
