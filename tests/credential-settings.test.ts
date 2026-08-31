import { describe, expect, it } from 'vitest';
import {
  isEncryptedCredentialLocked,
  LOCKED_API_KEY_WARNING,
  needsPassphraseToDisableEncryption,
  withEncryptedCredential,
  withPlaintextCredential,
} from '../lib/credential-settings';
import type { AnchorSettings, EncryptedSecret } from '../lib/types';

const settings: AnchorSettings = {
  highlightColor: 'yellow',
  highlightCoverage: 'medium',
  aiEnabled: true,
  aiProvider: 'openrouter',
  aiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
  aiModel: 'openrouter/free',
  aiApiKey: '',
};

const encrypted: EncryptedSecret = {
  version: 1,
  algorithm: 'AES-GCM',
  kdf: 'PBKDF2',
  hash: 'SHA-256',
  iterations: 250_000,
  salt: 'salt',
  iv: 'iv',
  ciphertext: 'ciphertext',
};

describe('API-key storage policy', () => {
  it('identifies an encrypted key that is unavailable until unlocked', () => {
    expect(isEncryptedCredentialLocked({ aiApiKeyEncrypted: encrypted }, '')).toBe(true);
    expect(isEncryptedCredentialLocked({ aiApiKeyEncrypted: encrypted }, 'sk-unlocked')).toBe(false);
    expect(LOCKED_API_KEY_WARNING).toContain('was not used');
  });

  it('requires the passphrase before converting an existing encrypted key to plaintext', () => {
    expect(needsPassphraseToDisableEncryption({ aiApiKeyEncrypted: encrypted }, '')).toBe(true);
    expect(needsPassphraseToDisableEncryption({ aiApiKeyEncrypted: encrypted }, 'sk-replacement')).toBe(false);
  });

  it('uses plaintext local settings unless encryption is explicitly selected', () => {
    const result = withPlaintextCredential(settings, 'sk-plain');

    expect(result.aiApiKey).toBe('sk-plain');
    expect(result.aiApiKeyEncrypted).toBeUndefined();
  });

  it('removes plaintext when encryption is selected', () => {
    const result = withEncryptedCredential({ ...settings, aiApiKey: 'sk-plain' }, encrypted);

    expect(result.aiApiKey).toBe('');
    expect(result.aiApiKeyEncrypted).toEqual(encrypted);
    expect(JSON.stringify(result)).not.toContain('sk-plain');
  });

  it('removes encrypted metadata when returning to plaintext storage', () => {
    const result = withPlaintextCredential(
      { ...settings, aiApiKeyEncrypted: encrypted },
      'sk-restored',
    );

    expect(result.aiApiKey).toBe('sk-restored');
    expect(result.aiApiKeyEncrypted).toBeUndefined();
  });
});
