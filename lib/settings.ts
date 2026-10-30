import type { AiProvider, AnchorSettings, EncryptedSecret, HighlightColor, HighlightCoverage } from './types';

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
  const candidate =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const aiProvider: AiProvider = ['local', 'openrouter', 'ollama', 'custom'].includes(candidate.aiProvider as string)
    ? (candidate.aiProvider as AiProvider)
    : candidate.aiMode === 'remote'
      ? 'custom'
      : DEFAULT_SETTINGS.aiProvider;
  const aiApiKeyEncrypted = normalizeEncryptedSecret(candidate.aiApiKeyEncrypted);
  return {
    highlightColor: ['yellow', 'mint', 'lilac', 'coral'].includes(candidate.highlightColor as string)
      ? (candidate.highlightColor as HighlightColor)
      : DEFAULT_SETTINGS.highlightColor,
    highlightCoverage: ['small', 'medium', 'full'].includes(candidate.highlightCoverage as string)
      ? (candidate.highlightCoverage as HighlightCoverage)
      : DEFAULT_SETTINGS.highlightCoverage,
    aiProvider,
    aiEnabled:
      typeof candidate.aiEnabled === 'boolean'
        ? candidate.aiEnabled
        : candidate.aiEnabled === undefined
          ? aiProvider !== 'local'
          : DEFAULT_SETTINGS.aiEnabled,
    aiEndpoint: typeof candidate.aiEndpoint === 'string' ? candidate.aiEndpoint : DEFAULT_SETTINGS.aiEndpoint,
    aiModel: typeof candidate.aiModel === 'string' ? candidate.aiModel : DEFAULT_SETTINGS.aiModel,
    aiApiKey:
      candidate.aiApiKeyEncrypted != null ? '' : typeof candidate.aiApiKey === 'string' ? candidate.aiApiKey : '',
    ...(aiApiKeyEncrypted ? { aiApiKeyEncrypted } : {}),
  };
}

function normalizeEncryptedSecret(value: unknown): EncryptedSecret | undefined {
  if (!value || typeof value !== 'object') return;
  const encrypted = value as Partial<EncryptedSecret>;
  if (
    encrypted.version !== 1 ||
    encrypted.algorithm !== 'AES-GCM' ||
    encrypted.kdf !== 'PBKDF2' ||
    encrypted.hash !== 'SHA-256' ||
    encrypted.iterations !== 250_000
  )
    return;
  try {
    if (
      typeof encrypted.salt !== 'string' ||
      atob(encrypted.salt).length !== 16 ||
      typeof encrypted.iv !== 'string' ||
      atob(encrypted.iv).length !== 12 ||
      typeof encrypted.ciphertext !== 'string' ||
      atob(encrypted.ciphertext).length < 16
    )
      return;
  } catch {
    return;
  }
  const { version, algorithm, kdf, hash, iterations, salt, iv, ciphertext } = encrypted;
  return { version, algorithm, kdf, hash, iterations, salt, iv, ciphertext } as EncryptedSecret;
}

export function shouldUseAiOrganizer(settings: AnchorSettings): boolean {
  return settings.aiEnabled && settings.aiProvider !== 'local';
}
