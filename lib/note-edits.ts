import type { AnchorNote, HighlightColor } from './types';

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
    tags: edits.tags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  };

  if (summary) updated.summary = summary;
  else delete updated.summary;

  return updated;
}
