# Anchor Notes agent guide

## Project overview

Anchor Notes is a local-first browser extension built with WXT, React, TypeScript, Vite, and Tailwind CSS. It saves selected webpage text with surrounding quote context, restores highlights after page markup changes, and provides a popup plus a full-page notes library. Data is stored in browser-local extension storage; there is no Anchor Notes backend.

The extension has three main runtime surfaces:

- `entrypoints/anchor.content/` runs in webpages. It captures selections, renders highlights, restores saved highlights, and provides the in-page note editor/popover.
- `entrypoints/background.ts` owns extension events, context-menu and keyboard-command handling, message routing, persistence orchestration, and optional AI organization.
- `entrypoints/popup/` and `entrypoints/options/` are React UIs for current-page notes and the complete library/settings experience.

## Repository layout

```text
entrypoints/
  background.ts             # background event handlers and runtime messages
  anchor.content/           # webpage selection, anchoring, restoration, and styles
  popup/                    # current-page popup UI
  options/                  # notes library, editing, settings, import/export
lib/
  types.ts                  # shared note, settings, and message types
  storage.ts                # browser-local storage access and normalization
  settings.ts               # settings defaults and legacy normalization
  organize.ts               # local tags and optional OpenAI-compatible organizer
  highlight-dom.ts          # DOM range-to-mark rendering
  text-range.ts             # DOM text traversal and quote matching
  note-editor.ts            # small editor helpers
  note-edits.ts             # library edit normalization
  note-preview.ts           # note-card preview truncation
  tags.ts                   # comma-separated tag parsing
  websites.ts               # hostname grouping and collapsed-state helpers
  credentials.ts            # runtime provider credential resolution
  credential-settings.ts    # encrypted/plaintext credential transitions
  secrets.ts                # Web Crypto passphrase encryption helpers
  firefox-permissions.ts    # Firefox remote-organizer consent helpers
tests/                      # Vitest unit/regression tests
styles/                     # shared Tailwind theme and base styles
public/                     # extension icons
wxt.config.ts               # manifest, WXT modules, and Vite plugins
```

## Development commands

Use Node.js 24 LTS (24.22.1 or newer within 24.x) and npm. `.nvmrc` pins the development/CI runtime; use `nvm install` and `nvm use` before installing dependencies. Keep `.nvmrc`, `engines.node`, `@types/node`, and runtime guidance aligned. Dependency upgrade decisions and security review are recorded in `docs/dependency-maintenance.md`.

```sh
npm install                 # install dependencies and prepare WXT types
npm run dev                 # watch and rebuild Chrome and Firefox extensions
npm run dev:chrome          # watch and rebuild the Chrome extension
npm run dev:firefox         # watch and rebuild the Firefox extension
npm run format              # format TypeScript, TSX, and CSS with Prettier
npm run format:check        # check formatting without changing files
npm run lint                # run ESLint and Stylelint
npm run lint:fix            # format and apply supported lint fixes
npm test                    # run the Vitest suite once
npm run test:coverage       # run Vitest and write coverage reports
npm run compile             # strict TypeScript check; emits no files
npm run build               # build .output/chrome-mv3
npm run build:firefox       # build .output/firefox-mv2
npm run validate:firefox    # validate the generated Firefox manifest
npm run test:e2e            # build the extension and run Playwright Chromium tests
npm run test:e2e:headed     # build the extension and run Playwright with a visible browser
npm run zip                 # create a store-ready extension archive
npm run zip:firefox         # create a Firefox extension archive
```

Prettier covers TypeScript, TSX, and CSS. ESLint covers TypeScript/TSX, and Stylelint covers project CSS. Generated WXT output, coverage, Playwright reports, and ZIP archives are ignored and must not be committed.

## Implementation conventions

- Keep shared data contracts in `lib/types.ts`; use the `ExtensionMessage` union and `satisfies` when sending runtime messages.
- Put browser-independent, deterministic logic in `lib/` so it can be unit tested without a browser runtime.
- Keep browser APIs and DOM lifecycle work in the relevant entrypoint. Content scripts must tolerate pages where messaging or DOM operations fail.
- Preserve strict TypeScript settings, including `noUncheckedIndexedAccess`; do not weaken compiler options to make a change compile.
- Normalize persisted/imported data through the helpers in `lib/storage.ts` and `lib/settings.ts` rather than assuming old data is complete.
- Use `parseTags` for user-entered comma-separated tags. Tags are lowercased, trimmed, de-duplicated, and allowed to be empty.
- Preserve note identity and timestamps when editing. `saveNote` merges updates by note ID and refreshes `updatedAt`.
- Keep local organization deterministic and network-free. Automatic AI organization is only for newly saved notes when the independent AI toggle and a remote provider are enabled. Existing notes may be sent only through the explicit library regeneration action, with the same toggle, credential, and Firefox consent checks.
- Never add a remote request for core highlighting, saving, searching, or restoring behavior.
- Treat API keys, passphrases, decrypted credentials, note contents, and URLs as sensitive. Do not log them, commit them, or add them to test fixtures unnecessarily.
- Optional AI generation prompts are sensitive request-only content. Keep them out of notes, settings, session progress, logs, and backups; only explicit library regeneration passes them to the provider.
- Keep credential migrations backward compatible: plaintext remains the default, encrypted secrets use the existing versioned PBKDF2/AES-GCM format, and decrypted keys live only in extension session storage.
- Use the existing Tailwind theme tokens and content-script CSS conventions instead of introducing a second styling system.

## Extension-specific behavior to preserve

- Notes match pages using normalized `url` or `canonicalUrl`; URL hashes and trailing slashes are removed by `normalizeUrl`.
- Highlight restoration searches the saved exact quote plus prefix/suffix context. It must skip scripts, styles, textareas, Anchor Notes UI, and existing highlight marks.
- DOM highlighting may span multiple text nodes. A failure wrapping one fragment must not prevent other fragments from rendering.
- The content script runs at `document_idle` on `<all_urls>` and cannot operate on browser-internal pages or other pages that reject content scripts.
- Background message handlers should return `{ ok: true, ... }` or `{ ok: false, error }` consistently and catch expected browser/storage/provider failures.
- Keep `schemaVersion` and normalization compatible with existing local data and JSON backups; changing the data shape requires migration thinking and regression tests.
- OpenRouter requests include the existing attribution headers. Ollama may be unauthenticated; custom providers use the configured OpenAI-compatible endpoint and optional bearer token.
- Firefox remote organizers require the existing optional `browsingActivity` and `websiteContent` consent flow. Do not request those permissions for the local-only workflow.

## Testing expectations

Add or update focused Vitest coverage for behavior changes, especially:

- quote matching, multi-node DOM highlighting, and restoration edge cases;
- storage/settings normalization and backward compatibility;
- tag parsing and deterministic local organization;
- runtime message behavior when changing background/content-script flows;
- library edit, grouping, import, and export behavior.

Before handing off a change, run:

```sh
npm run format:check
npm run lint
npm test
npm run compile
```

Run `npm run test:coverage` when changing browser-independent library behavior. Run `npm run test:e2e` when changing browser-facing behavior or the E2E harness. Run `npm run build`, `npm run build:firefox`, and `npm run validate:firefox` when changing WXT configuration, manifest permissions, entrypoints, imports, or packaging behavior. For UI or content-script changes, manually load the affected output in Chrome and Firefox and verify the flow on a normal webpage.

The GitHub Actions workflow in `.github/workflows/ci.yml` installs with `npm ci` and checks formatting, lint, a clean lint autofix, unit coverage, strict compilation, the Chrome build and Chromium E2E suite, plus the Firefox build and manifest validation. Coverage and Playwright artifacts are uploaded, and same-repository pull requests receive summary comments.

## GitHub workflow

- Create a GitHub issue for every feature request, bug, and chore before implementation. Use the issue to capture the problem, expected behavior, scope, and acceptance criteria. Use `enhancement` for features, `bug` for defects, and `chore` for maintenance. Add relevant subject labels such as `documentation` as needed.
- Use the in-repository templates when creating GitHub work items: `.github/ISSUE_TEMPLATE/feature_request.md` for features, `.github/ISSUE_TEMPLATE/bug_report.md` for bugs, `.github/ISSUE_TEMPLATE/chore.md` for chores, and `.github/pull_request_template.md` for pull requests. Complete the relevant sections and checklists, remove template comments before submitting, and follow the privacy/security guidance in each template.
- Use the same title convention for issues and pull requests: `[Feature]: <description>` for features, `[Bug]: <description>` for bugs, and `[Chore]: <description>` for chores. Write concise, sentence-case descriptions. Use the linked issue's title for its PR when the scope is unchanged; if the PR covers only part of the issue, keep the same prefix and describe that scope.
- Classify documentation cleanup, routine dependency maintenance, tooling, and CI upkeep as chores. Use Feature for new user-facing capabilities and Bug for defects, even when the implementation touches dependencies or tooling.
- Keep feature work, bug fixes, and unrelated chores in separate pull requests. Changes needed to complete the linked issue may stay together; each PR should have one clear purpose.
- Use clear Markdown in issue and PR descriptions, including headings, bullets or checklists, and links where useful. Each PR should have one clear purpose, link its GitHub issue, summarize user-visible behavior, and list tests/manual verification performed.
- Keep commits focused and avoid unrelated refactors or generated output. Do not commit `node_modules/`, `.output/`, `.wxt/`, coverage data, or ZIP artifacts.
- If work reveals a separate bug, feature, or chore, record it as a new GitHub issue and handle it in its own PR.
- Branch names should be concise but descriptive of the issue.

## Review checklist

- Is the change scoped to one feature, bug fix, or chore?
- Is there a linked GitHub issue?
- Are shared types, storage normalization, and runtime messages still compatible?
- Are sensitive note/provider values protected from logs and accidental network calls?
- Do formatting, lint, unit tests, and strict compilation pass?
- If applicable, was the built extension manually checked in Chrome and Firefox?

## For Windows Codex

- If there is a local `.gh-token` file, use it to authenticate to GitHub.
