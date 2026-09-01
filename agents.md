# Anchor Notes agent guide

## Project overview

Anchor Notes is a local-first Chrome extension built with WXT, React, TypeScript, Vite, and Tailwind CSS. It saves selected webpage text with surrounding quote context, restores highlights after page markup changes, and provides a popup plus a full-page notes library. Data is stored in `chrome.storage.local`; there is no Anchor Notes backend.

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
  storage.ts                # chrome.storage.local access and normalization
  organize.ts               # local tags and optional OpenAI-compatible organizer
  highlight-dom.ts          # DOM range-to-mark rendering
  note-editor.ts            # small editor helpers
  note-edits.ts             # library edit normalization
  tags.ts                   # comma-separated tag parsing
  websites.ts               # hostname grouping and collapsed-state helpers
tests/                      # Vitest unit/regression tests
styles/                     # shared Tailwind theme and base styles
public/                     # extension icons
wxt.config.ts               # manifest, WXT modules, and Vite plugins
```

## Development commands

Use Node.js 22 or newer and npm.

```sh
npm install                 # install dependencies and prepare WXT types
npm run dev                 # watch and rebuild the unpacked extension
npm test                    # run the Vitest suite once
npm run compile             # strict TypeScript check; emits no files
npm run build               # build .output/chrome-mv3
npm run test:e2e            # build the extension and run Playwright Chromium tests
npm run test:e2e:headed     # build the extension and run Playwright with a visible browser
npm run zip                 # create a store-ready extension archive
```

There is currently no lint or formatting script. Keep changes consistent with the surrounding code and use the existing TypeScript/Vitest checks as the minimum validation.

## Implementation conventions

- Keep shared data contracts in `lib/types.ts`; use the `ExtensionMessage` union and `satisfies` when sending runtime messages.
- Put browser-independent, deterministic logic in `lib/` so it can be unit tested without a Chrome runtime.
- Keep browser APIs and DOM lifecycle work in the relevant entrypoint. Content scripts must tolerate pages where messaging or DOM operations fail.
- Preserve strict TypeScript settings, including `noUncheckedIndexedAccess`; do not weaken compiler options to make a change compile.
- Normalize persisted/imported data through the helpers in `lib/storage.ts` and `lib/settings.ts` rather than assuming old data is complete.
- Use `parseTags` for user-entered comma-separated tags. Tags are lowercased, trimmed, de-duplicated, and allowed to be empty.
- Preserve note identity and timestamps when editing. `saveNote` merges updates by note ID and refreshes `updatedAt`.
- Keep local organization deterministic and network-free. Optional AI organization is only for newly saved notes when the independent AI toggle and a remote provider are enabled.
- Never add a remote request for core highlighting, saving, searching, or restoring behavior.
- Treat API keys and note contents as sensitive. Do not log them, commit them, or add them to test fixtures unnecessarily.
- Use the existing Tailwind theme tokens and content-script CSS conventions instead of introducing a second styling system.

## Extension-specific behavior to preserve

- Notes match pages using normalized `url` or `canonicalUrl`; URL hashes and trailing slashes are removed by `normalizeUrl`.
- Highlight restoration searches the saved exact quote plus prefix/suffix context. It must skip scripts, styles, textareas, Anchor Notes UI, and existing highlight marks.
- DOM highlighting may span multiple text nodes. A failure wrapping one fragment must not prevent other fragments from rendering.
- The content script runs at `document_idle` on `<all_urls>` and cannot operate on browser-internal pages or other pages that reject content scripts.
- Background message handlers should return `{ ok: true, ... }` or `{ ok: false, error }` consistently and catch expected browser/storage/provider failures.
- Keep `schemaVersion` and normalization compatible with existing local data and JSON backups; changing the data shape requires migration thinking and regression tests.
- OpenRouter requests include the existing attribution headers. Ollama may be unauthenticated; custom providers use the configured OpenAI-compatible endpoint and optional bearer token.

## Testing expectations

Add or update focused Vitest coverage for behavior changes, especially:

- quote matching, multi-node DOM highlighting, and restoration edge cases;
- storage/settings normalization and backward compatibility;
- tag parsing and deterministic local organization;
- runtime message behavior when changing background/content-script flows;
- library edit, grouping, import, and export behavior.

Before handing off a change, run:

```sh
npm test
npm run compile
```

Run `npm run test:e2e` when changing browser-facing behavior or the E2E harness. The GitHub Actions workflow in `.github/workflows/ci.yml` runs the unit suite, strict compile, production build, and Playwright Chromium tests on pushes and pull requests targeting `main`; it uses `npm ci` and does not require repository secrets. Run `npm run build` separately when changing WXT configuration, manifest permissions, entrypoints, imports, or packaging behavior. For UI or content-script changes, manually load `.output/chrome-mv3` in Chrome and verify the affected flow on a normal webpage.

## GitHub workflow

- Create a GitHub issue for every feature request and every bug before implementation. Use the issue to capture the problem, expected behavior, scope, and acceptance criteria.
- Use the in-repository templates when creating GitHub work items: `.github/ISSUE_TEMPLATE/feature_request.md` for features, `.github/ISSUE_TEMPLATE/bug_report.md` for bugs, and `.github/pull_request_template.md` for pull requests. Complete the relevant sections and checklists, remove template comments before submitting, and follow the privacy/security guidance in each template.
- Keep feature work and bug fixes in separate pull requests. Do not combine a new feature with an unrelated bug fix in one PR.
- Use clear Markdown in issue and PR descriptions, including headings, bullets or checklists, and links where useful. Each PR should have one clear purpose, link its GitHub issue, summarize user-visible behavior, and list tests/manual verification performed.
- Keep commits focused and avoid unrelated refactors or generated output. Do not commit `node_modules/`, `.output/`, `.wxt/`, coverage data, or ZIP artifacts.
- If work reveals a separate bug or feature, record it as a new GitHub issue and handle it in its own PR.

## Review checklist

- Is the change scoped to one feature or one bug fix?
- Is there a linked GitHub issue?
- Are shared types, storage normalization, and runtime messages still compatible?
- Are sensitive note/provider values protected from logs and accidental network calls?
- Do `npm test` and `npm run compile` pass?
- If applicable, was the built extension manually checked in Chrome?
