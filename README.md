# Anchor Notes

A local-first Chrome extension for highlighting the web, attaching notes, and finding those ideas again—even when a page's markup changes.

## Why this exists

Normal browser highlights are fragile and easy to forget. Anchor Notes addresses three specific problems:

- **Pages change:** every highlight stores the exact quote plus surrounding text and page metadata. Restoration searches by quote context instead of relying only on a brittle DOM path.
- **Saved pages disappear into bookmarks:** a searchable library groups notes by inferred topic and source, with a direct link back to the page.
- **Notes need structure:** private on-device rules add useful topic tags automatically. An optional OpenAI-compatible provider can generate richer tags and summaries for new notes.

All data is stored in `chrome.storage.local`. There is no Anchor Notes server.

## Install for development

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm run dev
```

Then:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `.output/chrome-mv3`.
5. Select text on a normal webpage and press **Option/Alt + Shift + H**, or use the right-click menu.

Chrome does not inject extensions into already-open tabs after installation. Refresh a page once before creating the first highlight.

## Tooling

- **WXT** owns extension entrypoints, manifest generation, development mode, and packaging.
- **Vite** is WXT's bundler and runs the Tailwind and React plugins.
- **React** powers the toolbar popup and full-page notes library.
- **TypeScript** provides strict types for notes, storage, messages, and browser APIs.
- **Tailwind CSS v4** styles both React entrypoints through its Vite plugin.
- **ESLint** checks TypeScript and TSX with the recommended `typescript-eslint` rules.
- **Stylelint** checks project CSS while recognizing Tailwind CSS v4 directives.
- **Prettier** formats TypeScript, TSX, and CSS consistently.

Useful commands:

```sh
npm run dev       # watch and rebuild the development extension
npm run format    # format TypeScript, TSX, and CSS
npm run format:check # check formatting without changing files
npm run lint      # lint TypeScript, TSX, and CSS
npm run lint:fix  # format and automatically fix lint violations where supported
npm test          # run highlight and LLM integration regression tests
npm run test:coverage # run unit tests and write the coverage reports
npm run compile   # run strict TypeScript checks
npm run build     # create .output/chrome-mv3
npm run zip       # create a store-ready extension archive
```

### Unit test coverage

`npm run test:coverage` runs the Vitest suite with the V8 coverage provider. It measures the browser-independent code in `lib/**/*.ts`, excluding the type-only `lib/types.ts` contract, and writes reports to the ignored `coverage/` directory. The text summary is saved as `coverage/coverage-summary.txt`, the detailed HTML report is available at `coverage/index.html`, and `coverage/lcov.info` is available for coverage tooling.

CI runs this command for pull requests and pushes to `main`, adds the concise summary to the workflow summary, and uploads the full `coverage/` directory as a build artifact. Coverage is advisory for now: CI fails when tests or report generation fail, but no percentage threshold fails the job. The initial baseline on `main` (2026-09-01) is 71.34% statements, 70.32% branches, 69.04% functions, and 74.50% lines (122/171 statements, 64/91 branches, 29/42 functions, and 114/153 lines). Revisit the baseline before introducing enforced thresholds.

## Features

- Highlight selected webpage text and attach a note.
- Restore highlights using quote, prefix, and suffix context.
- Open and edit a note by clicking its highlight on the original page.
- Choose a default color, recolor individual highlights, and set global small, medium, or entire-element text coverage.
- Browse notes for the current page from the toolbar popup.
- Group notes by website, or search, sort, filter, edit, delete, and revisit them in the library.
- Automatic local topic tags with no network requests.
- Optional OpenAI-compatible LLM organization.
- JSON export/import for backups and portability.
- React UI with a typed WXT build pipeline.

## Local tag generation

Every new note is tagged locally before any optional LLM organization runs:

1. Anchor Notes lowercases the page title, highlighted quote, and note body.
2. It checks that text against fixed keyword lists for `design`, `engineering`, `research`, `product`, `ideas`, and `learning`.
3. Each matching keyword contributes one point. The three highest-scoring topics are retained.
4. A short label derived from the source hostname is appended.
5. Duplicate tags are removed and the result is limited to four tags.

This path is deterministic and makes no network requests. It uses substring matching and a small English vocabulary, so its suggestions can be broad or incomplete. Tags can be corrected in the library or directly from the saved-highlight editor on the webpage.

## Optional LLM setup

Open **Anchor Notes → Settings** and choose an organizer:

- **OpenRouter:** uses `https://openrouter.ai/api/v1/chat/completions` and defaults to the `openrouter/free` router. Add an OpenRouter API key and optionally choose a specific open or free model slug.
- **Ollama:** connects locally through `http://localhost:11434/v1/chat/completions`. Pull the model in Ollama first, then enter the same model name in Anchor Notes. Local Ollama does not require an API key.
- **Custom:** accepts any OpenAI-compatible chat-completions endpoint, model, and optional bearer token.

Only notes created while an LLM provider is enabled are sent to that provider. Local topic rules remain the default.

Remote-provider API keys use Chrome extension local storage by default. That storage is local to the browser profile, but Chrome does not encrypt it for the extension. The Settings page labels this clearly and offers optional passphrase encryption; encryption is never enabled or applied automatically.

When encryption is selected, Anchor Notes derives a key from a passphrase with PBKDF2-SHA-256 (250,000 iterations) and stores only AES-GCM ciphertext plus the salt, IV, and algorithm metadata. The passphrase is never stored. After unlocking, the decrypted API key lives only in non-persistent extension session storage and must be unlocked again after Chrome restarts. Losing the passphrase requires replacing the API key. This protects the credential at rest, but not against a compromised browser profile or malicious extension code running while the key is unlocked.

If a new highlight is saved while an encrypted API key is locked, Anchor Notes saves the highlight and local tags but tells you that the key was not used. Unlock the key with its passphrase in Settings before relying on AI organization.

For a production release, route model calls through a small authenticated backend instead of shipping end-user API keys in extension storage.

## Project layout

```text
entrypoints/
  background.ts         # commands, context menu, persistence orchestration
  anchor.content/       # selection capture and resilient restoration
  popup/                # React current-page notes app
  options/              # React library and settings app
lib/                    # typed storage, note models, and organization logic
styles/                 # shared Tailwind theme and base styles
public/                 # extension icons copied into the build
wxt.config.ts           # manifest, React module, and Tailwind/Vite config
```

## Privacy and limitations

- Chrome sync is deliberately not used; large note collections can exceed its quota.
- If a page removes or substantially rewrites the quoted sentence, the extension retains the quote and note in the library but may not be able to reapply the visual highlight.
- Some browser-internal pages and the Chrome Web Store do not permit content scripts.
- Enabling OpenRouter or a custom remote LLM sends the saved quote, note, title, and URL to that provider. Ollama requests stay on the machine when its local endpoint is used.
- Remote LLM API keys are plaintext in local extension storage by default. Passphrase encryption is available as an explicit opt-in in Settings.

## Roadmap

- Optional encrypted sync.
- Archived page snapshots or Internet Archive links.
- Fuzzy anchoring for lightly edited quote text.
- Collections, backlinks, and related-note suggestions.
- Automated browser tests and Chrome Web Store packaging.

## License

MIT
