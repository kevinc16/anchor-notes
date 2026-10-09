import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_CLASS, removeEmptyHighlightMarks, wrapHighlightRange } from '../lib/highlight-dom';
import { findTextRange } from '../lib/text-range';

describe('wrapHighlightRange', () => {
  it('immediately wraps a selection spanning inline elements', () => {
    const window = new Window();
    const { document } = window;
    document.body.innerHTML = '<p id="article">Alpha <strong>beta</strong> gamma.</p>';
    const paragraph = document.querySelector('#article')!;
    const start = paragraph.childNodes[0]!;
    const end = paragraph.childNodes[2]!;
    const range = document.createRange();
    range.setStart(start, 2);
    range.setEnd(end, 4);

    const didWrap = wrapHighlightRange(range as unknown as Range, {
      id: 'note-1',
      color: 'mint',
      body: 'A cross-element note',
    });

    const marks = [...document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)];
    expect(didWrap).toBe(true);
    expect(marks).toHaveLength(3);
    expect(marks.map((mark) => mark.textContent).join('')).toBe('pha beta gam');
    expect(marks.every((mark) => mark.getAttribute('data-anchor-id') === 'note-1')).toBe(true);
    expect(marks.every((mark) => mark.getAttribute('data-anchor-color') === 'mint')).toBe(true);
    expect(marks.every((mark) => mark.getAttribute('data-anchor-coverage') === 'medium')).toBe(true);
  });

  it.each(['small', 'medium', 'full'] as const)('renders %s highlight coverage', (highlightCoverage) => {
    const window = new Window();
    const { document } = window;
    document.body.innerHTML = '<p>Coverage example</p>';
    const text = document.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.selectNodeContents(text);

    wrapHighlightRange(
      range as unknown as Range,
      {
        id: `note-${highlightCoverage}`,
        color: 'yellow',
        body: '',
      },
      highlightCoverage,
    );

    expect(document.querySelector('mark')?.getAttribute('data-anchor-coverage')).toBe(highlightCoverage);
  });

  it('finds and wraps a quote spanning an empty block line', () => {
    const window = new Window();
    const { document } = window;
    document.body.innerHTML = '<p>Before the blank line.</p><p></p><p>After the blank line.</p>';

    const range = findTextRange(document.body as unknown as Node, 'Before the blank line.\n\nAfter the blank line.');
    expect(range).not.toBeNull();

    const didWrap = wrapHighlightRange(range!, {
      id: 'empty-line-note',
      color: 'yellow',
      body: '',
    });

    expect(didWrap).toBe(true);
    expect([...document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)].map((mark) => mark.textContent).join('')).toBe(
      'Before the blank line.After the blank line.',
    );
  });

  it('does not create empty marks around a block quote', () => {
    const window = new Window();
    const { document } = window;
    document.body.innerHTML =
      '<blockquote class="highlight-middle">\n  <p>Read: <strong><em><a href="https://example.com">How to Install a Japanese Keyboard</a></em></strong></p>\n</blockquote>';

    const range = findTextRange(document.body as unknown as Node, 'Read: How to Install a Japanese Keyboard');
    expect(range).not.toBeNull();

    wrapHighlightRange(range!, {
      id: 'blockquote-note',
      color: 'lilac',
      body: '',
    });

    const marks = [...document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)];
    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => Boolean(mark.textContent?.trim()))).toBe(true);
  });

  it('removes stale whitespace-only highlight marks', () => {
    const window = new Window();
    const { document } = window;
    document.body.innerHTML =
      '<blockquote><mark class="anchor-note-highlight">\n  </mark><p>Read: <strong>How to Install a Japanese Keyboard</strong></p><mark class="anchor-note-highlight">\n</mark></blockquote>';

    expect(removeEmptyHighlightMarks(document.body as unknown as ParentNode)).toBe(2);
    expect(document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)).toHaveLength(0);
    expect(document.querySelector('blockquote')?.textContent).toContain('Read: How to Install a Japanese Keyboard');
  });
});
