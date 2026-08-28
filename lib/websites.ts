import type { AnchorNote } from './types';

export interface WebsiteNoteGroup {
  website: string;
  notes: AnchorNote[];
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown source';
  }
}

export function groupNotesByWebsite(notes: AnchorNote[]): WebsiteNoteGroup[] {
  const groups = new Map<string, AnchorNote[]>();

  for (const note of notes) {
    const website = hostFromUrl(note.url);
    const group = groups.get(website);
    if (group) group.push(note);
    else groups.set(website, [note]);
  }

  return [...groups].map(([website, websiteNotes]) => ({
    website,
    notes: websiteNotes,
  }));
}

export function toggleCollapsedWebsite(
  collapsedWebsites: ReadonlySet<string>,
  website: string,
): Set<string> {
  const next = new Set(collapsedWebsites);
  if (next.has(website)) next.delete(website);
  else next.add(website);
  return next;
}
