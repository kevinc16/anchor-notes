import { afterEach, describe, expect, it, vi } from 'vitest';
import { organizeLocally, organizeWithAI } from '../lib/organize';
import type { AnchorSettings } from '../lib/types';

const note = {
  title: 'Open models',
  url: 'https://example.com/article',
  quote: 'Open models can run locally.',
  body: 'Remember this setup.',
};

function mockCompletion() {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: 'Here is the JSON: {"tags":["ai","open-source"],"summary":"Local model setup"}' } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

afterEach(() => vi.unstubAllGlobals());

describe('organizeWithAI', () => {
  it('uses OpenRouter attribution and bearer headers', async () => {
    const fetchMock = mockCompletion();
    vi.stubGlobal('fetch', fetchMock);
    const settings: AnchorSettings = {
      highlightColor: 'yellow',
      aiProvider: 'openrouter',
      aiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      aiModel: 'openrouter/free',
      aiApiKey: 'test-key',
    };

    const result = await organizeWithAI(note, settings);
    const [, request] = fetchMock.mock.calls[0]!;
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'HTTP-Referer': 'https://github.com/kevinc16/anchor-notes',
      'X-OpenRouter-Title': 'Anchor Notes',
    });
    expect(JSON.parse(request.body).model).toBe('openrouter/free');
    expect(result.tags).toEqual(['ai', 'open-source']);
  });

  it('supports an unauthenticated local Ollama endpoint', async () => {
    const fetchMock = mockCompletion();
    vi.stubGlobal('fetch', fetchMock);
    const settings: AnchorSettings = {
      highlightColor: 'mint',
      aiProvider: 'ollama',
      aiEndpoint: 'http://localhost:11434/v1/chat/completions',
      aiModel: 'llama3.2',
      aiApiKey: '',
    };

    await expect(organizeWithAI(note, settings)).resolves.toBeDefined();
    const [endpoint, request] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe(settings.aiEndpoint);
    expect(request.headers).not.toHaveProperty('Authorization');
  });
});

describe('organizeLocally', () => {
  it('scores fixed topic keywords and appends a source tag without fetching', () => {
    const tags = organizeLocally({
      title: 'Interface typography research',
      quote: 'Color layout backed by evidence from a study.',
      body: '',
      url: 'https://www.example.com/article',
    });

    expect(tags).toEqual(['design', 'research', 'example']);
  });
});
