import type { EncryptedSecret } from './types';

export const MIN_PASSPHRASE_LENGTH = 12;
const PBKDF2_ITERATIONS = 250_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, usages: KeyUsage[]): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export async function encryptSecret(secret: string, passphrase: string): Promise<EncryptedSecret> {
  if (!secret) throw new Error('Enter an API key to encrypt.');
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Use a passphrase with at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(secret));

  return {
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptSecret(encrypted: EncryptedSecret, passphrase: string): Promise<string> {
  if (
    encrypted.version !== 1 ||
    encrypted.algorithm !== 'AES-GCM' ||
    encrypted.kdf !== 'PBKDF2' ||
    encrypted.hash !== 'SHA-256' ||
    encrypted.iterations !== PBKDF2_ITERATIONS
  ) {
    throw new Error('This encrypted credential format is not supported.');
  }

  const key = await deriveKey(passphrase, fromBase64(encrypted.salt), ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(encrypted.iv) },
    key,
    fromBase64(encrypted.ciphertext),
  );
  return decoder.decode(plaintext);
}
