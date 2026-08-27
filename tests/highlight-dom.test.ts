import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_CLASS, wrapHighlightRange } from '../lib/highlight-dom';

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
  });
});
