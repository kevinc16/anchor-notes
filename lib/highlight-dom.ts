import type { AnchorNote, HighlightCoverage, HighlightColor } from './types';
import { highlightOpacity } from './highlight-appearance';

export const HIGHLIGHT_CLASS = 'anchor-note-highlight';

export function refreshHighlightAppearance(mark: HTMLElement): void {
  const window = mark.ownerDocument.defaultView;
  if (!window) return;
  const parse = (value: string) =>
    value
      .match(/^rgba?\(([\d.,\s]+)\)$/)?.[1]
      ?.split(',')
      .map(Number);
  const foreground = parse(window.getComputedStyle(mark).color);
  // ponytail: estimate background colors; image backgrounds would require pixel sampling.
  const layers: number[][] = [];
  let parent = mark.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const background = parse(style.backgroundColor);
    if (background) {
      layers.push(background);
      if (background[3] === undefined || background[3] === 1) break;
    }
    parent = parent.parentElement;
  }
  const scheme = window.getComputedStyle(mark).colorScheme;
  let background = scheme === 'dark' ? [18, 18, 18] : [255, 255, 255];
  for (const layer of layers.reverse()) {
    const alpha = layer[3] ?? 1;
    background = background.map((value, index) => layer[index]! * alpha + value * (1 - alpha));
  }
  const opacity = foreground
    ? highlightOpacity(foreground, background, (mark.dataset.anchorColor as HighlightColor) || 'yellow')
    : 0.24;
  mark.style.setProperty('--anchor-highlight-opacity', String(opacity));
  mark.toggleAttribute('data-anchor-subtle-highlight', opacity < 0.1);
}

function unwrapMark(mark: HTMLElement): void {
  const parent = mark.parentNode;
  mark.replaceWith(...mark.childNodes);
  parent?.normalize();
}

export function removeEmptyHighlightMarks(root: ParentNode): number {
  let removed = 0;
  root.querySelectorAll<HTMLElement>(`mark.${HIGHLIGHT_CLASS}`).forEach((mark) => {
    if (mark.textContent?.trim()) return;
    unwrapMark(mark);
    removed += 1;
  });
  return removed;
}

export function wrapHighlightRange(
  range: Range,
  note: Pick<AnchorNote, 'id' | 'color' | 'body'>,
  highlightCoverage: HighlightCoverage = 'medium',
): boolean {
  const document = range.startContainer.ownerDocument;
  if (!document?.body) return false;
  const walker = document.createTreeWalker(document.body, 4, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return 2;
      if (
        node.parentElement?.closest(
          `script, style, textarea, #anchor-notes-composer, #anchor-notes-popover, .${HIGHLIGHT_CLASS}`,
        )
      ) {
        return 2;
      }
      try {
        return range.intersectsNode(node) ? 1 : 2;
      } catch {
        return 2;
      }
    },
  });
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) nodes.push(current as Text);

  let wrapped = 0;
  for (const node of nodes.reverse()) {
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (start >= end) continue;
    try {
      const fragmentRange = document.createRange();
      fragmentRange.setStart(node, start);
      fragmentRange.setEnd(node, end);
      const mark = document.createElement('mark');
      mark.className = HIGHLIGHT_CLASS;
      mark.dataset.anchorId = note.id;
      mark.dataset.anchorColor = note.color;
      mark.dataset.anchorCoverage = highlightCoverage;
      mark.title = note.body || 'Saved in Anchor Notes';
      fragmentRange.surroundContents(mark);
      refreshHighlightAppearance(mark);
      if (!mark.textContent?.trim()) {
        unwrapMark(mark);
        continue;
      }
      wrapped += 1;
    } catch {
      // A single fragment should not prevent the rest of the quote from rendering.
    }
  }
  return wrapped > 0;
}
