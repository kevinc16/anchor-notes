import type { AnchorNote, HighlightColor } from './types';
import { parseTags } from './tags';

export interface LibraryNoteEdits {
  body: string;
  summary: string;
  tags: string;
  color: HighlightColor;
}

export function applyLibraryNoteEdits(note: AnchorNote, edits: LibraryNoteEdits): AnchorNote {
  const summary = edits.summary.trim();
  const updated: AnchorNote = {
    ...note,
    body: edits.body.trim(),
    color: edits.color,
    tags: parseTags(edits.tags),
  };

  if (summary) updated.summary = summary;
  else delete updated.summary;

  return updated;
}
