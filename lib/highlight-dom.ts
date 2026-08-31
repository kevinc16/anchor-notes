import type { AnchorNote, HighlightCoverage } from './types';

export const HIGHLIGHT_CLASS = 'anchor-note-highlight';

export function wrapHighlightRange(
  range: Range,
  note: Pick<AnchorNote, 'id' | 'color' | 'body'>,
  highlightCoverage: HighlightCoverage = 'medium',
): boolean {
  const document = range.startContainer.ownerDocument;
  if (!document?.body) return false;
  const walker = document.createTreeWalker(document.body, 4, {
    acceptNode(node) {
      if (!node.nodeValue?.length) return 2;
      if (node.parentElement?.closest(`script, style, textarea, #anchor-notes-composer, #anchor-notes-popover, .${HIGHLIGHT_CLASS}`)) {
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
      wrapped += 1;
    } catch {
      // A single fragment should not prevent the rest of the quote from rendering.
    }
  }
  return wrapped > 0;
}
