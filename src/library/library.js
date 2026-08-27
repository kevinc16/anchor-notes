import { deleteNote, hostFromUrl, noteMatches, readData, saveNote, updateSettings, writeData } from "../shared/storage.js";

let data = await readData();
let activeFilter = "all";
let editingId = null;

const grid = document.getElementById("notes-grid");
const search = document.getElementById("search");
const filters = document.getElementById("filters");
const sort = document.getElementById("sort");

function renderFilters() {
  const counts = new Map();
  data.notes.flatMap((note) => note.tags || []).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  filters.querySelectorAll("[data-dynamic]").forEach((node) => node.remove());
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).forEach(([tag]) => {
    const button = document.createElement("button");
    button.dataset.dynamic = "true";
    button.dataset.filter = tag;
    button.textContent = tag;
    filters.appendChild(button);
  });
}

function visibleNotes() {
  let notes = data.notes.filter((note) => (activeFilter === "all" || note.tags?.includes(activeFilter)) && noteMatches(note, search.value));
  if (sort.value === "oldest") notes.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  else if (sort.value === "source") notes.sort((a, b) => hostFromUrl(a.url).localeCompare(hostFromUrl(b.url)));
  else notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return notes;
}

function renderNotes() {
  const notes = visibleNotes();
  document.getElementById("total-count").textContent = data.notes.length;
  grid.replaceChildren();
  if (!notes.length) {
    grid.innerHTML = `<div class="empty large"><strong>${data.notes.length ? "No matching notes" : "Your library is waiting"}</strong>${data.notes.length ? "Try a different search or topic." : "Highlight a useful passage on any webpage to begin."}</div>`;
    return;
  }
  for (const note of notes) {
    const card = document.createElement("article");
    card.className = "note-card";
    const source = document.createElement("div"); source.className = "note-source";
    source.innerHTML = `<span></span><time></time>`;
    source.querySelector("span").textContent = hostFromUrl(note.url);
    source.querySelector("time").textContent = new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const quote = document.createElement("blockquote"); quote.textContent = note.quote;
    card.append(source, quote);
    if (note.body) { const body = document.createElement("p"); body.className = "note-body"; body.textContent = note.body; card.appendChild(body); }
    const tags = document.createElement("div"); tags.className = "note-tags";
    (note.tags || []).forEach((tag) => { const item = document.createElement("span"); item.className = "tag"; item.textContent = tag; tags.appendChild(item); });
    const actions = document.createElement("div"); actions.className = "note-actions";
    const link = document.createElement("a"); link.href = note.url; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = "Return to source ↗";
    const buttons = document.createElement("div");
    const edit = document.createElement("button"); edit.textContent = "Edit"; edit.onclick = () => openEditor(note);
    const remove = document.createElement("button"); remove.textContent = "Delete"; remove.onclick = () => removeNote(note.id);
    buttons.append(edit, remove); actions.append(link, buttons); card.append(tags, actions); grid.appendChild(card);
  }
}

function openEditor(note) {
  editingId = note.id;
  document.getElementById("edit-quote").textContent = `“${note.quote}”`;
  document.getElementById("edit-body").value = note.body || "";
  document.getElementById("edit-tags").value = (note.tags || []).join(", ");
  document.getElementById("edit-dialog").showModal();
}

async function removeNote(id) {
  if (!confirm("Delete this saved highlight?")) return;
  await deleteNote(id); data = await readData(); renderFilters(); renderNotes(); showToast("Note deleted");
}

document.getElementById("save-edit").addEventListener("click", async (event) => {
  event.preventDefault();
  const note = data.notes.find((item) => item.id === editingId);
  if (!note) return;
  await saveNote({ ...note, body: document.getElementById("edit-body").value.trim(), tags: document.getElementById("edit-tags").value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean) });
  document.getElementById("edit-dialog").close(); data = await readData(); renderFilters(); renderNotes(); showToast("Changes saved");
});

filters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]"); if (!button) return;
  activeFilter = button.dataset.filter; filters.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button)); renderNotes();
});
search.addEventListener("input", renderNotes);
sort.addEventListener("change", renderNotes);

document.querySelectorAll(".nav-item").forEach((button) => button.onclick = () => {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
  document.getElementById("library-view").hidden = button.dataset.view !== "library";
  document.getElementById("settings-view").hidden = button.dataset.view !== "settings";
});

const mode = document.getElementById("ai-mode");
mode.value = data.settings.aiMode;
document.getElementById("ai-endpoint").value = data.settings.aiEndpoint;
document.getElementById("ai-model").value = data.settings.aiModel;
document.getElementById("ai-key").value = data.settings.aiApiKey;
const toggleRemote = () => document.getElementById("remote-settings").hidden = mode.value !== "remote";
mode.addEventListener("change", toggleRemote); toggleRemote();

document.getElementById("save-settings").onclick = async () => {
  await updateSettings({ aiMode: mode.value, aiEndpoint: document.getElementById("ai-endpoint").value.trim(), aiModel: document.getElementById("ai-model").value.trim(), aiApiKey: document.getElementById("ai-key").value.trim() });
  data = await readData(); showToast("Settings saved");
};

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `anchor-notes-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
}
document.getElementById("export").onclick = exportData;
document.getElementById("export-settings").onclick = exportData;
document.getElementById("import").onclick = () => document.getElementById("import-file").click();
document.getElementById("import-file").onchange = async (event) => {
  try {
    const incoming = JSON.parse(await event.target.files[0].text());
    if (!Array.isArray(incoming.notes)) throw new Error("This backup does not contain a notes array.");
    const byId = new Map([...data.notes, ...incoming.notes].map((note) => [note.id, note]));
    await writeData({ ...data, notes: [...byId.values()] }); data = await readData(); renderFilters(); renderNotes(); showToast("Backup imported");
  } catch (error) { alert(`Could not import backup: ${error.message}`); }
  event.target.value = "";
};

function showToast(message) { const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message; document.body.appendChild(toast); setTimeout(() => toast.remove(), 2200); }

renderFilters(); renderNotes();

