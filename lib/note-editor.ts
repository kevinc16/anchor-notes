import type { AnchorNote } from './types';

export function populateCurrentNote(
  textarea: Pick<HTMLTextAreaElement, 'value' | 'defaultValue'>,
  note: Pick<AnchorNote, 'body'>,
): void {
  const currentBody = typeof note.body === 'string' ? note.body : '';
  textarea.defaultValue = currentBody;
  textarea.value = currentBody;
}
