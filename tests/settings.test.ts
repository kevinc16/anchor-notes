import { describe, expect, it } from 'vitest';
import { normalizeSettings, shouldUseAiOrganizer } from '../lib/settings';

describe('normalizeSettings', () => {
  it('defaults global highlight coverage to medium', () => {
    expect(normalizeSettings({}).highlightCoverage).toBe('medium');
    expect(normalizeSettings({ highlightCoverage: 'full' }).highlightCoverage).toBe('full');
    expect(normalizeSettings({ highlightCoverage: 'invalid' }).highlightCoverage).toBe('medium');
  });

  it('keeps existing remote-provider installations enabled', () => {
    const settings = normalizeSettings({
      aiProvider: 'openrouter',
      aiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      aiModel: 'openrouter/free',
      aiApiKey: 'saved-key',
    });

    expect(settings.aiEnabled).toBe(true);
    expect(settings.aiProvider).toBe('openrouter');
    expect(settings.aiApiKey).toBe('saved-key');
  });

  it('keeps local-only installations disabled by default', () => {
    expect(normalizeSettings({ aiProvider: 'local' }).aiEnabled).toBe(false);
  });

  it('preserves a configured provider while LLM organization is disabled', () => {
    const settings = normalizeSettings({
      aiEnabled: false,
      aiProvider: 'custom',
      aiEndpoint: 'https://models.example/v1/chat/completions',
      aiModel: 'open-model',
      aiApiKey: 'saved-key',
    });

    expect(settings).toMatchObject({
      aiEnabled: false,
      aiProvider: 'custom',
      aiEndpoint: 'https://models.example/v1/chat/completions',
      aiModel: 'open-model',
      aiApiKey: 'saved-key',
    });
  });

  it('allows remote organization only when the independent toggle is enabled', () => {
    const remote = normalizeSettings({ aiEnabled: true, aiProvider: 'openrouter' });
    const disabled = normalizeSettings({ ...remote, aiEnabled: false });
    const local = normalizeSettings({ ...remote, aiProvider: 'local' });

    expect(shouldUseAiOrganizer(remote)).toBe(true);
    expect(shouldUseAiOrganizer(disabled)).toBe(false);
    expect(shouldUseAiOrganizer(local)).toBe(false);
  });
});

it('normalizes invalid imported preferences and discards unknown secret fields', () => {
  expect(
    normalizeSettings({
      highlightColor: 'invalid',
      highlightCoverage: false,
      aiProvider: 'invalid',
      aiEnabled: 'true',
      aiEndpoint: 123,
      aiModel: [],
      aiApiKey: {},
      passphrase: 'synthetic-passphrase',
      sessionApiKey: 'synthetic-session',
    }),
  ).toEqual({
    highlightColor: 'yellow',
    highlightCoverage: 'medium',
    aiProvider: 'local',
    aiEnabled: false,
    aiEndpoint: 'https://api.openai.com/v1/chat/completions',
    aiModel: 'gpt-4o-mini',
    aiApiKey: '',
  });
});
