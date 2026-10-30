import type { ThemePreference } from './types';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
