import type { AnchorNote, AnchorSettings } from './types';

// Only these deliberately constructed messages may be displayed by the library.
export class AIOrganizationError extends Error {}

const TOPICS: Record<string, string[]> = {
  design: ['design', 'interface', 'typography', 'color', 'layout', 'brand', 'ux', 'ui'],
  engineering: ['code', 'software', 'api', 'database', 'javascript', 'python', 'architecture'],
  research: ['study', 'research', 'evidence', 'paper', 'analysis', 'data', 'experiment'],
  product: ['product', 'customer', 'market', 'strategy', 'growth', 'roadmap', 'feature'],
  ideas: ['idea', 'inspiration', 'creative', 'concept', 'possibility', 'imagine'],
  learning: ['learn', 'guide', 'tutorial', 'explain', 'course', 'lesson', 'how to'],
};

/**
 * Generates deterministic tags without a model or network request.
 *
 * The title, quote, and user note are lowercased and scored against the fixed
 * topic vocabulary above. Each matching vocabulary entry contributes one
 * point, the three highest-scoring topics are retained, and a short source
 * label from the hostname is appended. Duplicates are removed and the final
 * list is limited to four tags.
 *
 * This intentionally simple fallback favors privacy and predictable behavior
 * over language understanding. Substring matching and the fixed English
 * vocabulary can produce broad or missing tags, which users can edit later.
 */
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
  signal?: AbortSignal,
  prompt?: string,
): Promise<{ tags: string[]; summary: string }> {
  const isOpenRouter = settings.aiProvider === 'openrouter';
  if (isOpenRouter && !settings.aiApiKey) throw new Error('Add an OpenRouter API key in Settings first.');
  const response = await fetch(settings.aiEndpoint, {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.aiApiKey ? { Authorization: `Bearer ${settings.aiApiKey}` } : {}),
      ...(isOpenRouter
        ? {
            'HTTP-Referer': 'https://github.com/kevinc16/anchor-notes',
            'X-OpenRouter-Title': 'Anchor Notes',
          }
        : {}),
    },
    body: JSON.stringify({
      model: settings.aiModel,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Return only JSON with a tags array containing 2-5 short lowercase topic tags and a summary string under 140 characters.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: note.title,
            url: note.url,
            quote: note.quote,
            note: note.body,
            ...(prompt?.trim() ? { guidance: prompt.trim() } : {}),
          }),
        },
      ],
    }),
  });
  const payload = (await response.json().catch(() => {
    if (response.ok) throw new AIOrganizationError('The AI provider returned an invalid JSON response.');
    return null;
  })) as {
    error?: string | { message?: unknown };
    message?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;
  if (!response.ok || payload?.error) {
    const error = payload?.error;
    const detail = [typeof error === 'string' ? error : error?.message, payload?.message].find(
      (value): value is string => typeof value === 'string' && Boolean(value.trim()),
    );
    let message = detail ?? '';
    if (settings.aiApiKey) message = message.split(settings.aiApiKey).join('[redacted]');
    message = message.replace(/\s+/g, ' ').trim().slice(0, 300);
    const prefix = response.ok ? 'AI provider error' : `AI request failed (${response.status})`;
    throw new AIOrganizationError(message ? `${prefix}: ${message}` : `${prefix}.`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new AIOrganizationError('The AI provider returned no tags and summary.');
  const withoutFence = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  const json = firstBrace >= 0 && lastBrace > firstBrace ? withoutFence.slice(firstBrace, lastBrace + 1) : withoutFence;
  let parsed: { tags?: unknown; summary?: unknown };
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid result.');
    parsed = value;
  } catch {
    throw new AIOrganizationError('The AI provider returned invalid tags and summary JSON.');
  }
  return {
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 5)
      : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}
