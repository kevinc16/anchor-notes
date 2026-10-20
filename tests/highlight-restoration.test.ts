import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeHighlightRestoration } from '../lib/highlight-restoration';
import { DEFAULT_SETTINGS } from '../lib/settings';
import type { AnchorData, AnchorNote } from '../lib/types';

const URL_A = 'https://example.com/a';
const URL_B = 'https://example.com/b';
function note(id = 'a', url = URL_A, quote = 'Alpha beta gamma.'): AnchorNote {
  return {
    id,
    url,
    canonicalUrl: url,
    title: 'Fixture',
    quote,
    body: '',
    color: 'mint',
    tags: [],
    anchor: {
      quote: { exact: quote, prefix: '', suffix: '' },
      startPath: 'body',
      endPath: 'body',
      startOffset: 0,
      endOffset: quote.length,
    },
    pageSnapshot: { description: '', capturedAt: '2026-10-20T00:00:00Z' },
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  };
}

describe('dynamic highlight restoration', () => {
  let window: Window;
  let document: Document;
  let data: AnchorData;
  let readData: ReturnType<typeof vi.fn<() => Promise<AnchorData>>>;
  let coordinator: ReturnType<typeof observeHighlightRestoration>;
  const marks = () => [...document.querySelectorAll<HTMLElement>('mark.anchor-note-highlight')];
  async function settle() {
    await vi.advanceTimersByTimeAsync(500);
  }
  beforeEach(() => {
    vi.useFakeTimers();
    window = new Window({ url: URL_A });
    // Happy DOM captures Node's real timers at import time; route only its timers through Vitest's clock.
    vi.spyOn(window, 'setTimeout').mockImplementation((callback, delay) => setTimeout(() => callback(), delay));
    vi.spyOn(window, 'clearTimeout').mockImplementation((timer) => clearTimeout(timer));
    document = window.document as unknown as Document;
    data = { schemaVersion: 1, settings: DEFAULT_SETTINGS, notes: [note()] };
    readData = vi.fn(async () => data);
  });
  afterEach(async () => {
    coordinator?.stop();
    await window.happyDOM.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('restores late text and retries after virtualization removes and reinserts it', async () => {
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    await settle();
    expect(marks().map((mark) => mark.textContent)).toEqual(['Alpha beta gamma.']);
    document.body.replaceChildren();
    await settle();
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    await settle();
    expect(marks()).toHaveLength(1);
  });

  it('repairs partial rerenders without duplicating a repeated quote', async () => {
    document.body.innerHTML = '<p>Alpha <b>beta</b> gamma.</p><p>Alpha beta gamma.</p>';
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    expect(marks()).toHaveLength(3);
    const original = marks()[0];
    document.body.append(document.createElement('aside'));
    await settle();
    expect(marks()).toHaveLength(3);
    expect(marks()[0]).toBe(original);
    document.querySelector('b')!.textContent = 'beta';
    await settle();
    expect(marks()).toHaveLength(3);
    expect(document.querySelectorAll('p')[1]!.querySelector('mark')).toBeNull();
  });

  it('coalesces mutation bursts and ignores its rendering and editor UI', async () => {
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    const initialReads = readData.mock.calls.length;
    for (let index = 0; index < 100; index++) document.body.append(document.createElement('p'));
    document.querySelector('p')!.textContent = 'Alpha beta gamma.';
    await settle();
    expect(marks()).toHaveLength(1);
    expect(readData.mock.calls.length).toBe(initialReads + 1);
    const composer = document.createElement('div');
    composer.id = 'anchor-notes-composer';
    document.body.append(composer);
    composer.textContent = 'Alpha beta gamma.';
    await settle();
    expect(readData.mock.calls.length).toBe(initialReads + 1);
  });

  it('clears previous-route marks even when the canonical link has not updated', async () => {
    document.head.innerHTML = `<link rel="canonical" href="${URL_A}">`;
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    data.notes.push(note('b', URL_B));
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    expect(marks().map((mark) => mark.dataset.anchorId)).toEqual(['a']);
    window.history.pushState({}, '', URL_B);
    coordinator.refresh();
    await settle();
    expect(marks().map((mark) => mark.dataset.anchorId)).toEqual(['b']);
  });

  it('matches the current canonical URL and reacts to canonical-only changes', async () => {
    window.history.replaceState({}, '', 'https://example.com/variant');
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    expect(marks()).toHaveLength(0);
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = URL_A;
    document.head.append(link);
    await settle();
    expect(marks().map((mark) => mark.dataset.anchorId)).toEqual(['a']);
    link.href = URL_B;
    await settle();
    expect(marks()).toHaveLength(0);
  });

  it('discards a delayed storage result after navigation', async () => {
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    let resolve!: (value: AnchorData) => void;
    readData.mockImplementationOnce(
      () =>
        new Promise<AnchorData>((done) => {
          resolve = done;
        }),
    );
    coordinator = observeHighlightRestoration(document, readData);
    window.history.pushState({}, '', URL_B);
    resolve(data);
    await settle();
    expect(marks()).toHaveLength(0);
  });

  it('catches storage failures and stops pending work on invalidation', async () => {
    readData.mockRejectedValueOnce(new Error('Storage unavailable'));
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    await settle();
    expect(marks()).toHaveLength(1);
    document.querySelector('p')!.textContent = 'Alpha beta gamma.';
    coordinator.refresh();
    coordinator.stop();
    await settle();
    expect(marks()).toHaveLength(0);
  });

  it('does not let an older storage read resurrect a deleted note', async () => {
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    const originalData = data;
    let resolve!: (value: AnchorData) => void;
    readData.mockImplementationOnce(
      () =>
        new Promise<AnchorData>((done) => {
          resolve = done;
        }),
    );
    coordinator = observeHighlightRestoration(document, readData);
    data = { ...data, notes: [] };
    coordinator.refresh();
    await settle();
    resolve(originalData);
    await settle();
    expect(marks()).toHaveLength(0);
  });

  it('restores while mutations continue and preserves marks on hash-only navigation', async () => {
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    for (let index = 0; index < 10; index++) {
      document.body.append(document.createElement('aside'));
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(marks()).toHaveLength(1);
    const original = marks()[0];
    window.history.pushState({}, '', `${URL_A}#section`);
    coordinator.refresh();
    await settle();
    expect(marks()).toEqual([original]);
  });

  it('does not starve restoration when page mutations overlap storage reads', async () => {
    readData.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 75));
      return data;
    });
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    document.body.innerHTML = '<p>Alpha beta gamma.</p>';
    for (let index = 0; index < 20; index++) {
      document.body.append(document.createElement('aside'));
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(marks()).toHaveLength(1);
  });

  it('removes stale fragments when text is inserted between them', async () => {
    document.body.innerHTML = '<p>Alpha <b>beta</b> gamma.</p>';
    coordinator = observeHighlightRestoration(document, readData);
    await settle();
    expect(marks()).toHaveLength(3);
    document.querySelector('b')!.before(document.createTextNode('INSERTED '));
    await settle();
    expect(document.querySelector('p')!.textContent).toBe('Alpha INSERTED beta gamma.');
    expect(marks()).toHaveLength(0);
  });
});
