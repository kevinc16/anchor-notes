import type { AnchorSettings, EncryptedSecret } from './types';

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
