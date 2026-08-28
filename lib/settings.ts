import type { AiProvider, AnchorSettings } from './types';

export const DEFAULT_SETTINGS: AnchorSettings = {
  highlightColor: 'yellow',
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

  return {
    ...DEFAULT_SETTINGS,
    ...currentSettings,
    aiProvider,
    aiEnabled,
  };
}
