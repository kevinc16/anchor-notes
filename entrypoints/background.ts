import { browser, defineBackground } from '#imports';
import { organizeLocally, organizeWithAI } from '@/lib/organize';
import { deleteNote, readData, saveNote } from '@/lib/storage';
import type { AnchorNote, ExtensionMessage, MessageResponse } from '@/lib/types';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() =>
      browser.contextMenus.create({
        id: 'anchor-save-selection',
        title: 'Save highlight to Anchor Notes',
        contexts: ['selection'],
      }),
    );
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'anchor-save-selection' && tab?.id) {
      void browser.tabs.sendMessage(tab.id, { type: 'CAPTURE_SELECTION' } satisfies ExtensionMessage).catch(() => undefined);
    }
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === 'open-library') {
      void browser.runtime.openOptionsPage();
      return;
    }

    if (command === 'save-highlight') {
      void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id) {
          void browser.tabs.sendMessage(tab.id, { type: 'CAPTURE_SELECTION' } satisfies ExtensionMessage).catch(() => undefined);
        }
      });
    }
  });

  browser.runtime.onMessage.addListener((message: ExtensionMessage): Promise<MessageResponse> | undefined => {
    if (message.type === 'SAVE_NOTE') {
      return (async () => {
        try {
          const data = await readData();
          const note: AnchorNote = {
            ...message.note,
            tags: organizeLocally(message.note),
          };
          await saveNote(note);

          if (data.settings.aiEnabled && data.settings.aiProvider !== 'local') {
            try {
              const organized = await organizeWithAI(note, data.settings);
              await saveNote({ ...note, ...organized });
            } catch (error) {
              console.warn('Anchor Notes AI organization failed:', error);
            }
          }
          return { ok: true, note };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Could not save note.' };
        }
      })();
    }

    if (message.type === 'UPDATE_NOTE') {
      return saveNote(message.note)
        .then((note) => ({ ok: true, note }))
        .catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not update note.',
        }));
    }

    if (message.type === 'GET_NOTE') {
      return readData()
        .then((data) => {
          const note = data.notes.find((item) => item.id === message.id);
          return note
            ? { ok: true, note }
            : { ok: false, error: 'This saved note could not be found.' };
        })
        .catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not load the saved note.',
        }));
    }

    if (message.type === 'DELETE_NOTE') {
      return deleteNote(message.id)
        .then(() => ({ ok: true }))
        .catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not delete note.',
        }));
    }

    if (message.type === 'OPEN_LIBRARY') {
      return browser.runtime.openOptionsPage()
        .then(() => ({ ok: true }))
        .catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not open the library.',
        }));
    }

    return undefined;
  });
});
