import type { AnchorSettings, EncryptedSecret } from './types';

export const LOCKED_API_KEY_WARNING = 'Highlight saved. Your encrypted API key is locked and was not used. Unlock it with your passphrase in Settings to enable AI organization.';

export function isEncryptedCredentialLocked(
  settings: Pick<AnchorSettings, 'aiApiKeyEncrypted'>,
  sessionApiKey: string,
): boolean {
  return Boolean(settings.aiApiKeyEncrypted && !sessionApiKey);
}

export function withPlaintextCredential(
  settings: AnchorSettings,
  apiKey: string,
): AnchorSettings {
  return {
    ...settings,
    aiApiKey: apiKey,
    aiApiKeyEncrypted: undefined,
  };
}

export function withEncryptedCredential(
  settings: AnchorSettings,
  encrypted: EncryptedSecret,
): AnchorSettings {
  return {
    ...settings,
    aiApiKey: '',
    aiApiKeyEncrypted: encrypted,
  };
}
