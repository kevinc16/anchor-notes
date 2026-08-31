import type { AiProvider, AnchorSettings, HighlightCoverage } from './types';

export const DEFAULT_SETTINGS: AnchorSettings = {
  highlightColor: 'yellow',
  highlightCoverage: 'medium',
  aiEnabled: false,
  aiProvider: 'local',
  aiEndpoint: 'https://api.openai.com/v1/chat/completions',
  aiModel: 'gpt-4o-mini',
  aiApiKey: '',
};

export function normalizeSettings(value: unknown): AnchorSettings {
  const legacySettings = value && typeof value === 'object'
    ? value as Partial<AnchorSettings> & { aiMode?: 'local' | 'remote' }
    : {};
  const { aiMode, ...currentSettings } = legacySettings;
  const aiProvider: AiProvider = currentSettings.aiProvider
    ?? (aiMode === 'remote' ? 'custom' : 'local');
  const aiEnabled = currentSettings.aiEnabled ?? aiProvider !== 'local';
  const highlightCoverage: HighlightCoverage = currentSettings.highlightCoverage === 'small'
    || currentSettings.highlightCoverage === 'full'
    || currentSettings.highlightCoverage === 'medium'
    ? currentSettings.highlightCoverage
    : DEFAULT_SETTINGS.highlightCoverage;

  return {
    ...DEFAULT_SETTINGS,
    ...currentSettings,
    highlightCoverage,
    aiProvider,
    aiEnabled,
  };
}

export function shouldUseAiOrganizer(settings: AnchorSettings): boolean {
  return settings.aiEnabled && settings.aiProvider !== 'local';
}
