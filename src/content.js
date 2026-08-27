(() => {
  const HIGHLIGHT_CLASS = "anchor-note-highlight";
  let pendingRange = null;

  function textContext(range) {
    const rootText = document.body.innerText || "";
    const quote = range.toString().trim();
    const index = rootText.indexOf(quote);
    return {
      exact: quote,
      prefix: index >= 0 ? rootText.slice(Math.max(0, index - 48), index) : "",
      suffix: index >= 0 ? rootText.slice(index + quote.length, index + quote.length + 48) : ""
    };
  }

  function cssPath(node) {
    if (!node || node === document.body) return "body";
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!element) return "body";
    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 7) {
      let selector = current.tagName.toLowerCase();
      if (current.id) { selector += `#${CSS.escape(current.id)}`; parts.unshift(selector); break; }
      const siblings = current.parentElement ? [...current.parentElement.children].filter((item) => item.tagName === current.tagName) : [];
      if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(selector);
      current = current.parentElement;
    }
    return `body > ${parts.join(" > ")}`;
  }

  function makeAnchor(range) {
    return {
      quote: textContext(range),
      startPath: cssPath(range.startContainer),
      startOffset: range.startOffset,
      endPath: cssPath(range.endContainer),
      endOffset: range.endOffset
    };
  }

  function showComposer() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return showToast("Select some text first");
    pendingRange = selection.getRangeAt(0).cloneRange();
    document.getElementById("anchor-notes-composer")?.remove();
    const rect = pendingRange.getBoundingClientRect();
    const composer = document.createElement("div");
    composer.id = "anchor-notes-composer";
    composer.innerHTML = `
      <div class="anchor-composer-kicker">New highlight</div>
      <div class="anchor-composer-quote"></div>
      <textarea maxlength="2000" placeholder="Why does this matter? (optional)"></textarea>
      <div class="anchor-composer-actions">
        <button class="anchor-cancel" type="button">Cancel</button>
        <button class="anchor-save" type="button">Save note</button>
      </div>`;
    composer.querySelector(".anchor-composer-quote").textContent = `“${selection.toString().trim()}”`;
    document.body.appendChild(composer);
    const left = Math.max(12, Math.min(window.innerWidth - 352, rect.left));
    const top = Math.max(12, Math.min(window.innerHeight - composer.offsetHeight - 12, rect.bottom + 12));
    Object.assign(composer.style, { left: `${left}px`, top: `${top}px` });
    composer.querySelector("textarea").focus();
    composer.querySelector(".anchor-cancel").onclick = () => { composer.remove(); pendingRange = null; };
    composer.querySelector(".anchor-save").onclick = () => saveSelection(composer);
  }

  async function saveSelection(composer) {
    if (!pendingRange) return;
    const quote = pendingRange.toString().trim();
    const id = crypto.randomUUID();
    const note = {
      id,
      url: location.href,
      canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || location.href,
      title: document.title || location.hostname,
      quote,
      body: composer.querySelector("textarea").value.trim(),
      anchor: makeAnchor(pendingRange),
      pageSnapshot: {
        description: document.querySelector('meta[name="description"]')?.content || "",
        capturedAt: new Date().toISOString()
      },
      color: "yellow",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const response = await chrome.runtime.sendMessage({ type: "SAVE_NOTE", note });
    if (!response?.ok) return showToast(response?.error || "Could not save note");
    wrapRange(pendingRange, note);
    composer.remove();
    pendingRange = null;
    window.getSelection()?.removeAllRanges();
    showToast("Highlight anchored");
  }

  function wrapRange(range, note) {
    try {
      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      mark.dataset.anchorId = note.id;
      mark.dataset.anchorColor = note.color || "yellow";
      mark.title = note.body || "Saved in Anchor Notes";
      range.surroundContents(mark);
      return true;
    } catch {
      return false;
    }
  }

  function findTextRange(exact, prefix = "", suffix = "") {
    if (!exact) return null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest(`script, style, textarea, #anchor-notes-composer, .${HIGHLIGHT_CLASS}`)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let text = "";
    let node;
    while ((node = walker.nextNode())) { nodes.push({ node, start: text.length }); text += node.nodeValue; }
    const matches = [];
    let from = 0;
    while ((from = text.indexOf(exact, from)) >= 0) { matches.push(from); from += exact.length; }
    if (!matches.length) return null;
    const start = matches.sort((a, b) => {
      const score = (index) => (prefix && text.slice(Math.max(0, index - prefix.length), index).endsWith(prefix) ? 2 : 0)
        + (suffix && text.slice(index + exact.length, index + exact.length + suffix.length).startsWith(suffix) ? 2 : 0);
      return score(b) - score(a);
    })[0];
    const startEntry = [...nodes].reverse().find((entry) => entry.start <= start);
    const endPosition = start + exact.length;
    const endEntry = [...nodes].reverse().find((entry) => entry.start < endPosition);
    if (!startEntry || !endEntry) return null;
    const range = document.createRange();
    range.setStart(startEntry.node, start - startEntry.start);
    range.setEnd(endEntry.node, endPosition - endEntry.start);
    return range;
  }

  async function restoreHighlights() {
    const { anchorNotesData } = await chrome.storage.local.get("anchorNotesData");
    const current = normalizeUrl(location.href);
    const notes = (anchorNotesData?.notes || []).filter((note) => normalizeUrl(note.url) === current || normalizeUrl(note.canonicalUrl) === current);
    for (const note of notes) {
      const selector = note.anchor?.quote;
      const range = findTextRange(selector?.exact || note.quote, selector?.prefix, selector?.suffix);
      if (range) wrapRange(range, note);
    }
  }

  function normalizeUrl(value) {
    try { const url = new URL(value); url.hash = ""; return url.href.replace(/\/$/, ""); }
    catch { return value; }
  }

  function showToast(message) {
    document.getElementById("anchor-notes-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "anchor-notes-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CAPTURE_SELECTION") showComposer();
    if (message.type === "SCROLL_TO_NOTE") {
      const mark = document.querySelector(`[data-anchor-id="${CSS.escape(message.id)}"]`);
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.getElementById("anchor-notes-composer")?.remove();
  });
  restoreHighlights();
})();
