import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { populateCurrentNote } from '../lib/note-editor';

describe('populateCurrentNote', () => {
  it('prefills the website editor with the latest saved note body', () => {
    const window = new Window();
    const textarea = window.document.createElement('textarea');

    populateCurrentNote(textarea as unknown as HTMLTextAreaElement, { body: 'First saved thought' });
    expect(textarea.value).toBe('First saved thought');

    populateCurrentNote(textarea as unknown as HTMLTextAreaElement, { body: 'Updated thought' });
    expect(textarea.value).toBe('Updated thought');
    expect(textarea.defaultValue).toBe('Updated thought');
  });
});
