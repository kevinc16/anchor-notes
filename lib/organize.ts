import type { AnchorNote, AnchorSettings } from './types';

const TOPICS: Record<string, string[]> = {
  design: ['design', 'interface', 'typography', 'color', 'layout', 'brand', 'ux', 'ui'],
  engineering: ['code', 'software', 'api', 'database', 'javascript', 'python', 'architecture'],
  research: ['study', 'research', 'evidence', 'paper', 'analysis', 'data', 'experiment'],
  product: ['product', 'customer', 'market', 'strategy', 'growth', 'roadmap', 'feature'],
  ideas: ['idea', 'inspiration', 'creative', 'concept', 'possibility', 'imagine'],
  learning: ['learn', 'guide', 'tutorial', 'explain', 'course', 'lesson', 'how to'],
};

export function organizeLocally(note: Pick<AnchorNote, 'title' | 'quote' | 'body' | 'url'>): string[] {
  const text = `${note.title} ${note.quote} ${note.body}`.toLowerCase();
  const scored = Object.entries(TOPICS)
    .map(([topic, words]) => [topic, words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0)] as const)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);

  let domain = 'web';
  try {
    domain = new URL(note.url).hostname.replace(/^www\./, '').split('.')[0] || 'web';
  } catch {
    // Keep the generic domain fallback.
  }
  return [...new Set([...scored, domain])].slice(0, 4);
}

export async function organizeWithAI(
  note: Pick<AnchorNote, 'title' | 'url' | 'quote' | 'body'>,
  settings: AnchorSettings,
): Promise<{ tags: string[]; summary: string }> {
  const isOpenRouter = settings.aiProvider === 'openrouter';
  if (isOpenRouter && !settings.aiApiKey) throw new Error('Add an OpenRouter API key in Settings first.');
  const response = await fetch(settings.aiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}),
      ...(isOpenRouter ? {
        'HTTP-Referer': 'https://github.com/kevinc16/anchor-notes',
        'X-OpenRouter-Title': 'Anchor Notes',
      } : {}),
    },
    body: JSON.stringify({
      model: settings.aiModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Return only JSON with a tags array containing 2-5 short lowercase topic tags and a summary string under 140 characters.',
        },
        {
          role: 'user',
          content: JSON.stringify({ title: note.title, url: note.url, quote: note.quote, note: note.body }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI request failed (${response.status}).`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? '';
  const withoutFence = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  const json = firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence;
  const parsed = JSON.parse(json) as {
    tags?: unknown;
    summary?: unknown;
  };
  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 5) : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}
