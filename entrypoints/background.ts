import { browser, defineBackground } from '#imports';
import { getBulkGeneration, startBulkGeneration } from '@/lib/bulk-generation';
import { isEncryptedCredentialLocked, LOCKED_API_KEY_WARNING } from '@/lib/credential-settings';
import { readSessionApiKey } from '@/lib/credentials';
import { organizeLocally } from '@/lib/organize';
import { generateSummary } from '@/lib/summary-generation';
import { noteReturnKey, openNoteSource, takeNoteReturn } from '@/lib/note-return';
import { shouldUseAiOrganizer } from '@/lib/settings';
import { bulkEditTags, deleteNote, readData, saveNote } from '@/lib/storage';
import type { AnchorNote, ExtensionMessage, MessageResponse } from '@/lib/types';

export default defineBackground(() => {
  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session.remove(noteReturnKey(tabId)).catch(() => undefined);
  });
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
      void browser.tabs
        .sendMessage(tab.id, { type: 'CAPTURE_SELECTION' } satisfies ExtensionMessage)
        .catch(() => undefined);
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
          void browser.tabs
            .sendMessage(tab.id, { type: 'CAPTURE_SELECTION' } satisfies ExtensionMessage)
            .catch(() => undefined);
        }
      });
    }
  });

  browser.runtime.onMessage.addListener((message: ExtensionMessage, sender): Promise<MessageResponse> | undefined => {
    if (
      message.type === 'BULK_EDIT_TAGS' ||
      message.type === 'START_BULK_GENERATION' ||
      message.type === 'GET_BULK_GENERATION'
    ) {
      // Bulk mutations are library actions, never webpage/content-script commands.
      if (sender.url?.split(/[?#]/)[0] !== browser.runtime.getURL('/options.html')) {
        return Promise.resolve({ ok: false, error: 'Open the library to use bulk actions.' });
      }
      if (message.type === 'GET_BULK_GENERATION') {
        return getBulkGeneration()
          .then((batch) => ({ ok: true, batch }))
          .catch(() => ({ ok: false, error: 'Could not load regeneration progress.' }));
      }
      if (
        !Array.isArray(message.ids) ||
        !message.ids.length ||
        message.ids.some((id) => typeof id !== 'string' || !id)
      ) {
        return Promise.resolve({ ok: false, error: 'Select at least one note.' });
      }
      if (message.type === 'BULK_EDIT_TAGS') {
        if (!['add', 'remove', 'replace'].includes(message.operation) || typeof message.tags !== 'string') {
          return Promise.resolve({ ok: false, error: 'Choose a valid tag operation.' });
        }
        return bulkEditTags(message.ids, message.operation, message.tags)
          .then((tagResult) => ({ ok: true, tagResult }))
          .catch(() => ({ ok: false, error: 'Could not update tags.' }));
      }
      return startBulkGeneration(message.ids)
        .then((batch) => ({ ok: true, batch }))
        .catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not start regeneration.',
        }));
    }
    if (message.type === 'RETURN_TO_SOURCE') {
      return (async () => {
        try {
          const data = await readData();
          const note = data.notes.find((item) => item.id === message.id);
          if (!note) return { ok: false, error: 'This saved note could not be found.' };
          await openNoteSource({ tabs: browser.tabs, session: browser.storage.session }, note, message.active);
          return { ok: true };
        } catch {
          return { ok: false, error: 'Could not open the source page.' };
        }
      })();
    }

    if (message.type === 'TAKE_NOTE_RETURN') {
      if (sender.tab?.id === undefined || sender.frameId !== 0) return Promise.resolve({ ok: true });
      return takeNoteReturn(browser.storage.session, sender.tab.id)
        .then((returnIntent) => ({ ok: true, returnIntent }))
        .catch(() => ({ ok: false, error: 'Could not read the return request.' }));
    }
    if (message.type === 'SAVE_NOTE') {
      return (async () => {
        try {
          const data = await readData();
          const note: AnchorNote = {
            ...message.note,
            tags: organizeLocally(message.note),
          };
          await saveNote(note);

          if (shouldUseAiOrganizer(data.settings)) {
            const sessionApiKey = await readSessionApiKey();
            if (isEncryptedCredentialLocked(data.settings, sessionApiKey)) {
              return { ok: true, note, warning: LOCKED_API_KEY_WARNING };
            }
            await generateSummary(note, {
              ...data.settings,
              aiApiKey: sessionApiKey || data.settings.aiApiKey,
            });
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
          return note ? { ok: true, note } : { ok: false, error: 'This saved note could not be found.' };
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
      return browser.runtime
        .openOptionsPage()
        .then(() => ({ ok: true }))
        .catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not open the library.',
        }));
    }

    return undefined;
  });
});
