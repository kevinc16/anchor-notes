import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, MIN_PASSPHRASE_LENGTH } from '../lib/secrets';

describe('encrypted API keys', () => {
  it('round-trips a key without storing plaintext in the payload', async () => {
    const apiKey = 'sk-test-sensitive-value';
    const encrypted = await encryptSecret(apiKey, 'a secure test passphrase');

    expect(JSON.stringify(encrypted)).not.toContain(apiKey);
    await expect(decryptSecret(encrypted, 'a secure test passphrase')).resolves.toBe(apiKey);
  });

  it('rejects an incorrect passphrase', async () => {
    const encrypted = await encryptSecret('sk-test', 'correct horse battery staple');
    await expect(decryptSecret(encrypted, 'incorrect passphrase value')).rejects.toThrow();
  });

  it('requires a passphrase of the configured minimum length', async () => {
    await expect(encryptSecret('sk-test', 'short')).rejects.toThrow(`at least ${MIN_PASSPHRASE_LENGTH} characters`);
  });
});
