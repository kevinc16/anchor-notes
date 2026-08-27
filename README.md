# Anchor Notes

A local-first Chrome extension for highlighting the web, attaching notes, and finding those ideas again—even when a page's markup changes.

## Why this exists

Normal browser highlights are fragile and easy to forget. Anchor Notes addresses three specific problems:

- **Pages change:** every highlight stores the exact quote plus surrounding text and page metadata. Restoration searches by quote context instead of relying only on a brittle DOM path.
- **Saved pages disappear into bookmarks:** a searchable library groups notes by inferred topic and source, with a direct link back to the page.
- **Notes need structure:** private on-device rules add useful topic tags automatically. An optional OpenAI-compatible provider can generate richer tags and summaries for new notes.

All data is stored in `chrome.storage.local`. There is no Anchor Notes server.

## Install for development

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `anchor-notes` folder.
5. Select text on a normal webpage and press **Option/Alt + Shift + H**, or use the right-click menu.

Chrome does not inject extensions into already-open tabs after installation. Refresh a page once before creating the first highlight.

## Features

- Highlight selected webpage text and attach a note.
- Restore highlights using quote, prefix, and suffix context.
- Browse notes for the current page from the toolbar popup.
- Search, sort, filter, edit, delete, and revisit notes in the library.
- Automatic local topic tags with no network requests.
- Optional OpenAI-compatible LLM organization.
- JSON export/import for backups and portability.
- No framework and no build step.

## Optional LLM setup

Open **Anchor Notes → Settings**, choose **Remote LLM**, then enter an OpenAI-compatible chat-completions endpoint, model, and API key. The key is stored in Chrome local extension storage. Only notes created while this mode is enabled are sent to the configured provider.

For a production release, route model calls through a small authenticated backend instead of shipping end-user API keys in extension storage.

## Project layout

```text
manifest.json
src/
  background.js        # commands, context menu, persistence orchestration
  content.js           # selection capture and resilient highlight restoration
  content.css          # isolated in-page UI styles
  popup/                # current-page notes
  library/              # searchable library and settings
  shared/               # storage schema and organization logic
```

## Privacy and limitations

- Chrome sync is deliberately not used; large note collections can exceed its quota.
- If a page removes or substantially rewrites the quoted sentence, the extension retains the quote and note in the library but may not be able to reapply the visual highlight.
- Some browser-internal pages and the Chrome Web Store do not permit content scripts.
- Enabling remote LLM organization sends the saved quote, note, title, and URL to the provider you configure.

## Roadmap

- Optional encrypted sync.
- Archived page snapshots or Internet Archive links.
- Fuzzy anchoring for lightly edited quote text.
- Collections, backlinks, and related-note suggestions.
- Automated browser tests and Chrome Web Store packaging.

## License

MIT

