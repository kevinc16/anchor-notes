# Anchor Notes

A local-first browser extension for highlighting webpage text, attaching notes, and finding them again. Highlights restore using the saved quote and surrounding text, even when page markup changes.

Notes and settings stay in browser-local extension storage. There is no Anchor Notes backend.

## Features

- Highlight text, choose colors and text coverage, and click highlights to edit notes.
- Browse current-page notes in the popup; search, sort, filter, and group them by website in the library.
- Generate topic tags locally, edit tags in bulk, or optionally use AI for tags and summaries.
- Export and import notes as JSON backups.

## Install for development

Requires **Node.js 24 LTS** (24.22.1 or newer within 24.x) and npm. Firefox builds require **Firefox 140+**.

```sh
nvm install
nvm use
npm install
npm run dev
```

`npm run dev` watches and rebuilds both browsers. Use `npm run dev:chrome` or `npm run dev:firefox` for one browser. Keep the command running while developing.

### Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `.output/chrome-mv3-dev`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…** and select `.output/firefox-mv2-dev/manifest.json`.

WXT rebuilds on source changes and reloads the temporary extension when connected to Firefox. If Firefox does not open automatically, load the manifest manually. Temporary add-ons are removed when Firefox restarts; load the manifest again afterward.

After installation, refresh already-open webpages. Select text and press **Option/Alt + Shift + H**, or use the right-click menu, to save a highlight. Open the toolbar popup for current-page notes or press **Option/Alt + Shift + L** for the library.

### Build and check

```sh
npm run format:check      # check TypeScript, TSX, and CSS formatting
npm run lint              # run ESLint and Stylelint
npm test                  # run unit tests
npm run compile           # check TypeScript
npm run build             # build .output/chrome-mv3
npm run build:firefox      # build .output/firefox-mv2
npm run validate:firefox   # validate the Firefox manifest
```

Load one-time builds using the same browser steps above, selecting `.output/chrome-mv3` or `.output/firefox-mv2/manifest.json` instead of the development paths.

## Optional AI organization

Local topic tagging runs without network requests. In **Settings**, enable AI organization and choose OpenRouter, Ollama, or a custom OpenAI-compatible provider to generate tags and summaries for new notes. Existing notes are sent only through **Regenerate tags and summaries** in the library.

To guide regeneration, choose **Select notes**, select one or more notes, and enter an **AI prompt (optional)** before choosing **Regenerate tags and summaries**. The same guidance accompanies each selected note independently and can influence both topic tags and summary emphasis; leaving it blank keeps the default instructions. Guidance does not change the saved quote or note body. It is sent to your configured provider but is not saved in extension storage or backups. **Retry failed notes** uses the current prompt field; after reopening or reloading the library, enter the guidance again if needed.

See the [organization guide](docs/organization.md) for provider setup, bulk actions, generation status, and API key encryption.

## Privacy and limitations

- Notes stay in the current browser profile; browser sync is not used. Export JSON for backups or transfers.
- Remote AI sends the saved quote, note, page title, and URL to the configured provider. Ollama stays on-device when using its local endpoint. Firefox requests consent before remote organization; local features need no such consent.
- API keys are plaintext in local extension storage by default. Optional passphrase encryption keeps unlocked keys in session storage until the browser restarts.
- Highlights may not restore if the quoted text changes substantially. The saved quote and note remain in the library.
- Browser-internal pages and some extension gallery pages block content scripts.

The extension uses `storage`, `contextMenus`, and `<all_urls>` access to save notes, capture selections, restore highlights, read page metadata, and contact enabled providers. It does not request `tabs` or `activeTab`. Firefox’s optional `browsingActivity` and `websiteContent` consent applies only to remote organization.

Read the [privacy policy](PRIVACY.md) for details.

## Documentation

- [Organization guide](docs/organization.md): local tags, bulk editing, AI providers, and credentials.
- [Development reference](docs/development.md): tooling, commands, coverage, Playwright/Checkly CI, project layout, and UI state.
- [Dependency maintenance](docs/dependency-maintenance.md): runtime support, upgrades, and security reviews.
- [Agent and contributor guide](AGENTS.md): implementation conventions, testing, and GitHub workflow.
- [Issue tracker](https://github.com/kevinc16/anchor-notes/issues): planned work and bug reports.

## License

MIT
