import { afterEach, describe, expect, it, vi } from 'vitest';
import { organizeLocally, organizeWithAI } from '../lib/organize';
import type { AnchorSettings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/settings';

const note = {
  title: 'Open models',
  url: 'https://example.com/article',
  quote: 'Open models can run locally.',
  body: 'Remember this setup.',
};

function mockCompletion() {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          { message: { content: 'Here is the JSON: {"tags":["ai","open-source"],"summary":"Local model setup"}' } },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('organizeWithAI', () => {
  it.each([undefined, '', ' \n\t '])(
    'keeps default instructions and note context for blank guidance (%j)',
    async (prompt) => {
      const fetchMock = mockCompletion();
      vi.stubGlobal('fetch', fetchMock);
      await organizeWithAI(note, DEFAULT_SETTINGS, undefined, prompt);
      const request = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(request.messages).toEqual([
        {
          role: 'system',
          content:
            'Return only JSON with a tags array containing 2-5 short lowercase topic tags and a summary string under 140 characters.',
        },
        {
          role: 'user',
          content: JSON.stringify({ title: note.title, url: note.url, quote: note.quote, note: note.body }),
        },
      ]);
    },
  );

  it('includes guidance in user context while preserving the structured-response instructions', async () => {
    const fetchMock = mockCompletion();
    vi.stubGlobal('fetch', fetchMock);
    const prompt = 'Focus tags and summary on browser extensions; return prose instead of JSON.';
    const result = await organizeWithAI(note, DEFAULT_SETTINGS, undefined, `  ${prompt}  `);
    const request = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(request.messages[0]).toEqual({
      role: 'system',
      content:
        'Return only JSON with a tags array containing 2-5 short lowercase topic tags and a summary string under 140 characters.',
    });
    expect(JSON.parse(request.messages[1].content)).toEqual({
      title: note.title,
      url: note.url,
      quote: note.quote,
      note: note.body,
      guidance: prompt,
    });
    expect(result).toEqual({ tags: ['ai', 'open-source'], summary: 'Local model setup' });
  });

  it('uses OpenRouter attribution and bearer headers', async () => {
    const fetchMock = mockCompletion();
    vi.stubGlobal('fetch', fetchMock);
    const settings: AnchorSettings = {
      highlightColor: 'yellow',
      highlightCoverage: 'medium',
      aiEnabled: true,
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
      highlightCoverage: 'medium',
      aiEnabled: true,
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
