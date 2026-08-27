import { deleteNote, readData, saveNote } from "./shared/storage.js";
import { organizeLocally, organizeWithAI } from "./shared/organize.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "anchor-save-selection",
    title: "Save highlight to Anchor Notes",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "anchor-save-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_SELECTION" });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-library") return chrome.runtime.openOptionsPage();
  if (command === "save-highlight") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_SELECTION" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "SAVE_NOTE") {
      const data = await readData();
      const tags = organizeLocally(message.note);
      const note = { ...message.note, tags };
      await saveNote(note);
      if (data.settings.aiMode === "remote" && data.settings.aiApiKey) {
        try {
          const organized = await organizeWithAI(note, data.settings);
          await saveNote({ ...note, ...organized });
        } catch (error) {
          console.warn("Anchor Notes AI organization failed:", error);
        }
      }
      sendResponse({ ok: true, note });
    }
    if (message.type === "DELETE_NOTE") {
      await deleteNote(message.id);
      sendResponse({ ok: true });
    }
    if (message.type === "OPEN_LIBRARY") {
      await chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
    }
  })().catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

