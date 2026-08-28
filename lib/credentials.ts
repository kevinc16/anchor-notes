import { storage } from '#imports';

const sessionApiKey = storage.defineItem<string>('session:anchorNotesAiApiKey', {
  defaultValue: '',
});

export function readSessionApiKey(): Promise<string> {
  return sessionApiKey.getValue();
}

export function writeSessionApiKey(apiKey: string): Promise<void> {
  return sessionApiKey.setValue(apiKey);
}

export function clearSessionApiKey(): Promise<void> {
  return sessionApiKey.removeValue();
}
