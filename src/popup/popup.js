import { readData } from "../shared/storage.js";

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const title = document.getElementById("page-title");
const host = document.getElementById("page-host");
const notesRoot = document.getElementById("notes");

title.textContent = tab?.title || "Current page";
try { host.textContent = new URL(tab.url).hostname.replace(/^www\./, ""); } catch { host.textContent = ""; }

const normalize = (value) => {
  try { const url = new URL(value); url.hash = ""; return url.href.replace(/\/$/, ""); }
  catch { return value; }
};

const data = await readData();
const pageUrl = normalize(tab?.url || "");
const notes = data.notes.filter((note) => normalize(note.url) === pageUrl || normalize(note.canonicalUrl) === pageUrl);
document.getElementById("note-count").textContent = `${notes.length} highlight${notes.length === 1 ? "" : "s"}`;

if (!notes.length) {
  notesRoot.innerHTML = `<div class="empty"><strong>Nothing anchored yet</strong>Select a passage on this page and save what caught your attention.</div>`;
} else {
  for (const note of notes) {
    const card = document.createElement("article");
    card.className = "note";
    const quote = document.createElement("blockquote");
    quote.textContent = note.quote;
    card.appendChild(quote);
    if (note.body) { const body = document.createElement("p"); body.textContent = note.body; card.appendChild(body); }
    const footer = document.createElement("div");
    footer.className = "note-footer";
    footer.innerHTML = `<span>${new Date(note.createdAt).toLocaleDateString()}</span><button type="button">Show on page</button>`;
    footer.querySelector("button").onclick = async () => {
      await chrome.tabs.sendMessage(tab.id, { type: "SCROLL_TO_NOTE", id: note.id });
      window.close();
    };
    card.appendChild(footer);
    notesRoot.appendChild(card);
  }
}

document.getElementById("open-library").onclick = () => chrome.runtime.openOptionsPage();
document.getElementById("open-all").onclick = () => chrome.runtime.openOptionsPage();

