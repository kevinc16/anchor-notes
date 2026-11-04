# Open PDF in Anchor Notes implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Use `superpowers:subagent-driven-development` only if the user selects delegated execution. Track progress with the checkboxes below.

**Goal:** Let users explicitly open a PDF in Anchor Notes on Chrome and Firefox, select text, and create durable local notes and highlights.

**Architecture:** Bundle PDF.js's existing generic viewer and integrate the existing Anchor Notes composer/popover. Keep PDF text selectors and highlight overlays separate from webpage DOM highlighting. An extension-owned viewer page loads documents, while the background routes note operations and commands to that viewer. Optionally retain PDF bytes in extension-origin IndexedDB, keyed by SHA-256, separately from notes in extension storage.

**Tech stack:** Existing WXT, TypeScript, React popup/library, browser-local storage, native IndexedDB, Vitest, Playwright; a pinned official PDF.js distribution with its worker and required assets.

**Spec:** [Issue #67](https://github.com/kevinc16/anchor-notes/issues/67), amended by the [opt-in viewer decision](https://github.com/kevinc16/anchor-notes/issues/67#issuecomment-6630463278). The user authorized implementation as separate PRs, each delivering working functionality. The execution staging below supersedes the original task order.

## Global constraints

- Offer **Open PDF in Anchor Notes** explicitly. Do not register `mime_types_handler`, intercept PDF responses, or replace the browser's default PDF viewer.
- Support the existing Chrome MV3 and Firefox MV2 targets; retain Firefox minimum version `140.0` unless a separately justified compatibility decision is approved.
- Use Node `24.22.1` or newer within `24.x`, npm, strict TypeScript, and `noUncheckedIndexedAccess`.
- Reuse PDF.js viewer controls for navigation, search, zoom, and rotation. Do not write a new PDF renderer or custom implementations of those controls.
- Bundle runtime code, worker, fonts, CMaps, locales, images, and any required WASM locally. No CDN, remote code, telemetry, or PDF upload.
- Offer **Keep PDF on this device** as an explicit per-document choice, off by default. Persist opted-in PDF bytes only in extension-origin IndexedDB; never put bytes in note records, JSON backups, session storage, sync storage, or provider requests. Existing opt-in AI behavior may send the saved note fields, never the document or its full extracted text.
- Retaining a PDF must not be required to read it or save notes. Storage failures must leave viewing and note saving usable. Removing a retained PDF keeps its notes; uninstalling the extension or clearing its data can remove retained PDFs. JSON backups restore notes and selectors, not documents.
- Preserve existing webpage capture, storage schema version `1`, note IDs/timestamps, import/export, themes, colors, tags, and AI consent rules.
- Support multi-span selection within one page. Reject cross-page selections with clear feedback. OCR, native PDF annotation export, automatic interception, and embedded-PDF discovery are out of scope.

## Proposed product choices

These choices fill in details not settled in the issue discussion; they can be adjusted during review.

1. Put an always-available **Open PDF in Anchor Notes** action in the popup. It opens a viewer tab with a URL field and **Choose PDF file**. Prefill the active HTTP(S) tab URL but wait for the user's Open action; do not fetch a non-PDF page merely by opening the popup. This also supports PDF endpoints without `.pdf` suffixes.
2. Loading a remote PDF is a fresh GET request. Explain failures and offer **Open original** and **Choose PDF file**. Do not promise replay of POST requests, browser credentials, or expired/single-use links. Local-file selection is the supported route for `file:`, `blob:`, and inaccessible documents.
3. Compute SHA-256 over the loaded bytes once, before PDF.js can transfer/detach them. Remote notes retain the requested source URL; local-file notes use `anchor-notes:pdf:sha256:<hex>` as stable identity, with the filename as title. Never persist an object URL or an absolute local file path.
4. A remote PDF note also records the document digest. When a remote fetch fails, a user-selected file may reconnect to that remote source only if its digest matches the saved document. A different document at the same URL must not receive old highlights silently.
5. Offer **Keep PDF on this device** after a remote PDF or local file loads successfully. Retain a single byte copy per document hash, even if the PDF has several source URLs or filenames. When reopening a saved note, look up its exact document hash in IndexedDB first and use those bytes without a network request or file picker. Retain the note's original source URL and page anchor; document retention does not merge note identities across sources.
6. Password-protected and malformed documents get explicit unsupported/error UI plus an original-document link when available. Image-only pages remain readable but explain that text highlighting requires a text layer; mixed documents can still be annotated on text-bearing pages.
7. When no retained copy is available, remote sources use the existing URL/file fallback and local sources require selecting the same file again. Explain the missing copy and verify the digest before restoring. Group local-source notes as **Local PDFs** in the library.
8. Add a **Saved PDFs** area in the library listing retained documents, their sizes, and total retained byte usage. Offer **Remove saved PDF** with clear copy that notes remain. Deleting notes does not automatically delete a saved PDF, and removing bytes does not disrupt an already-open viewer. Do not silently evict documents or promise unlimited/permanent storage. Leave document-inclusive backup/export and automatic cleanup for follow-up work.

## Review focus

- Extension-page command delivery: two open viewers must never receive each other's capture or scroll commands (task 5).
- Authenticated/expired URLs, redirects to HTML, and unsupported schemes: fail visibly, retain source identity, and offer file fallback (tasks 2 and 6).
- Repeated quotes, changed documents, and identical local filenames: restore only the correct page/document (tasks 1 and 4).
- Async render cancellation: rapid zoom/rotation/navigation must not leave stale, duplicate, or wrong-page overlays (task 4).
- Packaging and hostile PDFs: all assets resolve under extension CSP; PDF scripts and external resource loading do not gain extension privileges (tasks 2 and 6).
- Quota failures, duplicate retention from concurrent tabs, and missing retained data: no false saved state, lost notes, or silent refetch of a different document (tasks 2a, 5, and 6).

## File map

| Files | Responsibility |
| --- | --- |
| `lib/types.ts`, `lib/pdf-anchor.ts` | Backward-compatible PDF selector and deterministic text matching/validation |
| `lib/storage.ts`, `lib/backup.ts` | Preserve and validate new selectors through persistence/import without rewriting legacy notes |
| `lib/pdf-documents.ts`, `tests/pdf-documents.test.ts` | IndexedDB PDF bytes/metadata, deduplication, source lookup, listing, and removal |
| `public/pdfjs/`, `scripts/vendor-pdfjs.mjs` | Pinned upstream generic viewer distribution, reproducible acquisition, license/provenance |
| `entrypoints/pdf/index.html`, `main.ts`, `viewer.ts`, `style.css` | Viewer host, document loading, upstream viewer integration, status UI, selections and overlays |
| `lib/note-ui.ts`, `entrypoints/anchor.content/index.ts` | Extract existing composer/popover behavior for two surfaces; retain webpage lifecycle locally |
| `lib/pdf-navigation.ts`, `entrypoints/background.ts`, `lib/note-return.ts` | Safe viewer URLs, tab-scoped viewer commands, return navigation |
| `entrypoints/popup/App.tsx`, `entrypoints/options/App.tsx`, `lib/websites.ts` | Open action, active PDF note matching, return links, local-file display/grouping |
| `wxt.config.ts`, `eslint.config.mjs`, `.prettierignore` | Local asset/CSP/source packaging and exclusion of vendored code from project lint/format |
| `tests/pdf-*.test.ts`, `tests/e2e/pdf.spec.ts`, `tests/e2e/fixtures.ts` | Selector, routing, lifecycle, and browser regression coverage |

Keep upstream files isolated in `public/pdfjs/`; put integration code in the PDF entrypoint, not throughout the vendor tree. Add a separate file only when its responsibility needs independent tests. Do not refactor unrelated library or settings UI.

## Task 1: Define PDF identity and selectors

**Files:** Create `lib/pdf-anchor.ts`, `tests/pdf-anchor.test.ts`; modify `lib/types.ts`, `lib/storage.ts`, `lib/backup.ts`, `lib/highlight-restoration.ts`; extend `tests/backup.test.ts` and relevant storage/restoration tests.

**Interfaces:** Keep `HighlightAnchor`'s existing DOM fields and quote intact. Add optional `pdf: PdfSelector` with `{ version: 1; pageNumber: number; documentHash: string; start: number; end: number }`. Offsets index a documented whitespace-normalized page-text string; page numbers are one-based. PDF captures populate legacy DOM paths with empty strings, and PDF-aware rendering takes precedence. Expose `normalizePdfText(text: string): string`, `normalizePdfSelector(value: unknown): PdfSelector | undefined`, and `findPdfQuote(text: string, anchor: HighlightAnchor): { start: number; end: number } | undefined`.

- [ ] Add failing tests: missing PDF selector leaves a legacy note unchanged; selector survives save/edit/export/import; reject non-integer pages/offsets, negative/reversed offsets, unsupported version, and invalid digest. A malformed declared PDF selector must never fall through into webpage rendering.
- [ ] Add failing matching tests: whitespace/newlines, Unicode, repeated quote with distinct context, empty text, offsets that no longer match the quote, and equal-scoring ambiguous matches. Prefer validated offsets; fall back to exact quote plus context on the same page; return no match when ambiguous. Do not introduce fuzzy matching or hyphen-removal guesses in v1.
- [ ] Run `npm test -- tests/pdf-anchor.test.ts tests/backup.test.ts`; verify the new assertions fail for missing behavior.
- [ ] Implement the additive selector and validation. Preserve valid legacy objects and unknown note metadata; specifically validate new PDF fields without attempting a whole-storage cleanup. Reject malformed declared PDF selectors on new save/import before mutation. Existing malformed PDF notes remain readable/editable in the library but explicitly unanchorable. Webpage restoration skips any note declaring a PDF selector, including an invalid one, so a matching quote cannot incorrectly highlight an HTML page at the source URL.
- [ ] Repeat the targeted tests, then `npm run compile`; commit this isolated data-contract change.

## Task 2: Bundle and load the existing PDF.js viewer

**Files:** Create `public/pdfjs/`, `scripts/vendor-pdfjs.mjs`, `entrypoints/pdf/{index.html,main.ts,viewer.ts,style.css}`, `lib/pdf-navigation.ts`, `tests/pdf-navigation.test.ts`, `tests/pdf-loading.test.ts`; modify build/lint/format configuration and `docs/dependency-maintenance.md`.

**Interfaces:** `pdfViewerUrl(extensionBaseUrl: string, source?: string, noteId?: string): string` constructs an extension-owned URL using `URLSearchParams`; `parsePdfViewerUrl(url: string, extensionBaseUrl: string): { source?: string; noteId?: string } | undefined` accepts only this extension's exact viewer path. Document identity is `{ url: string; title: string; documentHash: string }`. URL loading accepts HTTP(S) only; local input supplies `File.arrayBuffer()`.

- [ ] Add failing tests for query encoding, nested source queries/fragments, foreign extension origins, lookalike viewer paths, unsupported schemes, HTTP failures, HTML responses, malformed PDF bytes, and aborted/replaced loads. Treat MIME headers as evidence, not a filename requirement; allow valid PDF bytes served as octet-stream.
- [ ] Run those tests and verify failures. Add a local text-based PDF fixture and a minimal viewer-load browser test before implementing the host.
- [ ] Select a maintained official PDF.js generic release compatible with Firefox 140; record its exact version, release URL, SHA-256, license/NOTICE, and provenance. The vendor script verifies the digest and imports only runtime assets, not demo PDFs or source maps. Track assets needed for an offline reproducible extension build; do not download at extension runtime or ordinary build time. Do not assume `pdfjs-dist` includes the complete generic viewer HTML/toolbar.
- [ ] Wrap the generic viewer from an extension-owned host and initialize it without auto-fetching the upstream sample document. Keep the viewer in the same extension page context so selection/event integration is direct. Pin any small upstream bootstrap patch and document it for upgrades; do not remove arbitrary-source checks globally without replacement validation in our host.
- [ ] Fetch remote bytes in the viewer with cancellation and a visible loading state, hash once, then supply bytes directly to PDF.js. Keep source URL independent of the viewer's location. Cancel and destroy the previous loading task/document on replacement or teardown. Verify actual cookie behavior on Chrome and Firefox; failures use local-file fallback.
- [ ] Disable PDF JavaScript execution and automatic external resource fetching using the selected release's supported configuration. Resolve worker/assets locally and preserve extension CSP; add only narrowly required local worker/WASM policy if verified necessary. Keep external links user-initiated and unprivileged.
- [ ] Implement URL/file controls, native-original link, error states, password unsupported state, and text-layer availability feedback. Do not label a whole document image-only merely because its first page has no text.
- [ ] Verify the focused tests and viewer-load browser test plus both production builds. Inspect asset paths and offline requests in both browsers before committing; if upstream viewer/CSP compatibility fails, resolve it before starting note integration rather than silently writing a replacement viewer.

## Task 2a: Retain PDFs locally on explicit request

**Files:** Create `lib/pdf-documents.ts`, `tests/pdf-documents.test.ts`; modify `entrypoints/pdf/{viewer.ts,style.css}`, `entrypoints/options/App.tsx`; extend `tests/e2e/pdf.spec.ts`. A small `entrypoints/options/SavedPdfs.tsx` may contain the retained-document list if this keeps the existing options entrypoint focused.

**Interfaces:** Use native IndexedDB database `anchorNotesPdfDocuments`, version `1`. A `documents` store uses the SHA-256 hash as its key and contains `{ hash: string; bytes: Blob; title: string; size: number; savedAt: string }`; a `sources` store maps original source URLs to retained hashes for explicit URL opens without a note ID. Expose `keepPdfDocument(input: { hash: string; bytes: Blob; title: string; sourceUrl?: string }): Promise<void>`, `readPdfDocument(hash: string): Promise<StoredPdfDocument | undefined>`, `findPdfDocument(sourceUrl: string): Promise<StoredPdfDocument | undefined>`, `listPdfDocuments(): Promise<Array<Omit<StoredPdfDocument, 'bytes'>>>`, and `removePdfDocument(hash: string): Promise<void>`. `StoredPdfDocument` is the document record above. No new IndexedDB wrapper dependency. This module is imported only by owned extension pages, never by webpage content scripts.

- [ ] Add failing tests for same-hash deduplication, multiple source URLs sharing one blob, two different documents with the same filename, exact-hash reads, and removal leaving note storage untouched. Retaining a newer document at the same URL updates the source lookup atomically but preserves older hash records for their existing notes.
- [ ] Add failure coverage for quota/transaction aborts, blocked/unavailable database access, stale source mappings, and concurrent tabs retaining/removing the same hash. Atomic transactions update bytes and source mappings together; announce success only after transaction completion. Removing a hash also removes its source mappings. A failed replacement must preserve the previously retained copy/mapping.
- [ ] Run the new tests and verify failure before implementation. Prefer existing browser tests for native IndexedDB integration; exercise transaction paths through a small test double only where needed for deterministic quota/abort cases.
- [ ] Implement the store and API, record sizes from `Blob.size`, and avoid loading every PDF blob to list metadata. Hash and create the retained byte snapshot before PDF.js transfers/detaches its input; keep the hash tied to those exact bytes. Commit a retention only after the document is successfully opened and the user requests it. Do not persist malformed/password-protected inputs from failed loads.
- [ ] Add the per-document **Keep PDF on this device** choice and saved/pending/error states. Already-retained documents show saved state; a successful retention survives reload/browser restart. Explain quota errors without discarding the in-memory PDF or unsaved note. Explicit removal clears the saved state only on successful deletion. Do not request broad storage permissions as a substitute for handling quota failures; inspect Chrome/Firefox extension quota behavior during verification.
- [ ] Add library **Saved PDFs** management with metadata-based usage totals, Open, and **Remove saved PDF**. Usage means bytes retained by Anchor Notes, not the browser's total storage estimate. Reopen by hash, preserving any selected note's source identity. Removing the only retained copy warns in the action's copy that reopening may require downloading/selecting it again; notes and currently rendered pages remain usable. Refresh other open extension views after retention/removal without broadcasting document bytes.
- [ ] Verify IndexedDB behavior in Chromium and Firefox: retention, fully offline reopen after extension/browser restart, repeated saves from two tabs, removal, and missing-copy fallback. Record results and commit this independently testable storage feature.

## Task 3: Reuse the note composer and editor

**Files:** Create `lib/note-ui.ts`, `tests/note-ui.test.ts`; modify `entrypoints/anchor.content/index.ts`, its styles only as needed, and PDF entrypoint integration.

**Interfaces:** Define `NoteCapture` as `Pick<AnchorNote, 'url' | 'canonicalUrl' | 'title' | 'quote' | 'anchor' | 'pageSnapshot'> & { rect: DOMRect }` and `CaptureResult` as `{ capture: NoteCapture } | { error: string }`. Extract `mountNoteUi(surface: { captureSelection(): CaptureResult; renderNote(note: AnchorNote): Promise<boolean>; removeNote(id: string): void })` returning `{ showComposer(): Promise<void>; showNote(id: string, rect: DOMRect): Promise<void>; stop(): void }`. The shared UI creates IDs/timestamps, preserves capture snapshots while editing, and supplies body/color from the composer. Keep concrete browser messaging and existing helpers; this is one shared editor for two surfaces, not a plugin framework.

- [ ] Add focused failing tests for composer capture snapshots surviving focus changes, rejected capture not saving, storage failure leaving no phantom highlight, and edit/recolor/delete retaining note identity. Keep existing webpage browser tests as extraction regression coverage.
- [ ] Run the new tests, then extract the current UI with its theme, tag parsing, deletion confirmation, warnings, and `SAVE_NOTE`/`UPDATE_NOTE`/`GET_NOTE`/`DELETE_NOTE`/`OPEN_LIBRARY` messages unchanged. Wire webpage callbacks to current DOM behavior; keep its restoration observer and WXT invalidation handling in the content entrypoint.
- [ ] Ensure the PDF viewer receives shared UI styles explicitly (content-script manifest CSS will not load there). Theme the integration using existing tokens without rebuilding upstream controls.
- [ ] Verify new unit tests and `tests/e2e/highlighting.spec.ts`, `tests/e2e/note-management.spec.ts`, and `tests/e2e/theme.spec.ts`; commit only once extraction preserves existing behavior.

## Task 4: Capture and restore PDF highlights

**Files:** Modify `entrypoints/pdf/viewer.ts`, PDF styles, and `lib/pdf-anchor.ts` if needed; create `tests/pdf-restoration.test.ts`; extend `tests/e2e/pdf.spec.ts`.

**Interfaces:** The PDF surface uses the shared editor from task 3. Build a page-text index mapping normalized string offsets to text-layer DOM positions. `capturePdfSelection(selection: Selection): CaptureResult` returns either a capture or a user-facing rejection. `showPdfNote(id: string): Promise<boolean>` requests the saved page, waits for its current text layer, restores, and scrolls to its overlay. PDF.js events and viewer APIs stay behind the concrete integration in `viewer.ts`.

- [ ] Add failing tests: selection across several spans on one page, repeated quotes on different pages, a cross-page selection rejected with **Select text within one PDF page**, no-text selection, out-of-range pages, and mismatched document digest.
- [ ] Add failing lifecycle tests for delayed text layers, page eviction/recreation, rapid zoom/rotation, storage edits/deletion, and a pending scroll to an initially unrendered page. Require one current overlay group per note/page and no stale references after teardown.
- [ ] Capture selection before opening/focusing the composer, scope text/context and offsets to its page, and attach its document digest. Exclude toolbars, existing Anchor Notes UI, and non-page text from the index. Define newline/separator handling once and use the same mapping for capture and restore.
- [ ] Render non-text-mutating highlight rectangles from a restored DOM range into a dedicated page overlay. Recompute rectangles against the current viewport/text layer after every rerender; do not wrap PDF.js text spans with `<mark>`. Clear each page's old overlay before replacing it. Preserve text selection; make saved highlights accessible for click/keyboard editing using the shared editor.
- [ ] Subscribe to the pinned viewer's page/text-layer lifecycle and storage changes. Use a render generation/token to discard stale async results. Deferred scrolling must request the target page and wait for its text layer, not merely query existing DOM. Explain unmatched/changed-document anchors visibly.
- [ ] Verify focused tests plus reopen, reload, zoom, rotation, multi-span save, recolor/delete, and delayed-page browser tests; commit.

## Task 5: Connect popup, commands, and library navigation

**Files:** Modify `lib/types.ts`, `entrypoints/background.ts`, `entrypoints/popup/App.tsx`, `entrypoints/options/App.tsx`, `lib/note-return.ts`, `lib/websites.ts`; extend `lib/pdf-navigation.ts`; create `tests/pdf-routing.test.ts`; extend note-return/website tests.

**Interfaces:** Add `OPEN_PDF_VIEWER` with optional `source` and `id`, and `PDF_VIEWER_COMMAND` with `action: 'capture' | 'scroll'`, optional note `id`, and target `tabId`. The viewer connects to background via a named `anchor-pdf-viewer` runtime port. On connect, validate sender extension URL and use `sender.tab.id` as the authoritative registry key. Reconnect after background suspension; remove entries on disconnect. Do not trust a viewer-supplied arbitrary tab ID or broadcast capture to every extension page.

- [ ] Add failing routing tests: two PDF tabs, active webpage beside PDF tab, disconnected port, background restart/reconnect, wrong extension/page sender, and popup scroll targeting the correct viewer. Existing webpage commands must continue using `tabs.sendMessage`.
- [ ] Implement popup Open action and URL prefill. For an active owned viewer resolve its source from its validated viewer URL or request its local document identity through the background port; never use `pdf.html` as the saved source. List local notes only after a file identity has been established.
- [ ] Route toolbar save commands, context-menu capture, and popup Show on page to the active PDF port; provide an in-viewer Save highlight button so selection capture is discoverable without a shortcut. Return clear errors when the viewer is not ready. If the popup is on a native PDF tab with saved PDF notes, Show on page explicitly opens that note in the Anchor Notes viewer rather than trying content-script injection.
- [ ] Extend return navigation so PDF notes open the owned viewer with their original source and note ID; it waits for document/page rendering before scrolling. Read the note's exact retained document hash first, without fetching or prompting. An explicit URL open without a note ID may use its retained source mapping, with clear saved-copy status and an explicit **Reload from source** action; never overwrite retained bytes automatically. If a note's hash is missing, do not substitute the URL's newer saved version: fall back to fetching/selecting the expected document and verify its digest. Keep the existing webpage session-intent path unchanged. Validate note ID/source consistency and digest before navigation/restoration.
- [ ] Update actual library link `href`, ordinary click, modifier/middle-click, and background-failure fallback for PDF notes; context-menu Open link must also reach the viewer. Use **Local PDFs** for synthetic-source display/grouping. Preserve remote website grouping.
- [ ] Verify routing, note-return, website tests and browser flows for popup matching, offline retained-file reopening, local-file reselection when retention is off/missing, two simultaneous viewers, and library navigation; commit.

## Task 6: Finish compatibility, regression coverage, and documentation

**Files:** Extend `tests/e2e/fixtures.ts`, `tests/e2e/pdf.spec.ts`, `scripts/validate-firefox-build.mjs`, `wxt.config.ts`, `README.md`, `docs/development.md`, `docs/dependency-maintenance.md`; add synthetic PDF fixtures under `tests/e2e/fixtures/`.

- [ ] Serve local multi-page PDFs as `application/pdf` at a route without a `.pdf` suffix. Include repeated quotes, multi-span text, a textless page, and a page loaded later. Add malformed/password-protected fixtures, an HTML redirect/login response, and an endpoint that returns octet-stream. Use generated synthetic content with documented fixture provenance.
- [ ] Cover full save/reopen/reload, page lazy loading, zoom/rotation with no duplicate overlays, edit/recolor/delete, library/popup return, wrong-file fallback, failed save, and existing webpage highlighting in Chromium. Assert opening/reading/highlighting PDFs makes no provider request when AI is disabled; enabled AI requests contain only existing saved note fields and no PDF bytes/full-document text.
- [ ] Cover both retention settings, deduplication, offline reopen across a persistent browser-context restart, exact-hash navigation after the URL changes, quota failure feedback, library storage totals/removal, and missing/deleted IndexedDB data. Assert retained reopen makes no source request; byte removal preserves notes and JSON export never includes PDF blobs/base64. Importing a backup must not clear the existing IndexedDB documents or imply that missing PDFs were restored.
- [ ] Test keyboard-accessible controls, Escape/dismiss behavior, light/dark themes, and page scroll to highlights. Check download/open-original controls retain intended source and do not leak blob URLs into records.
- [ ] Extend Firefox validation to check viewer/worker/assets are packaged and Chrome MIME-handler keys are absent. Include required upstream source/provenance in source archives under the existing Git allowlist policy; run `npm run test:packaging` and inspect the generated archive. Exclude vendored code from project formatter/linter without excluding our integration.
- [ ] Document opt-in opening and retention, offline access to saved copies, fresh-GET limitations, local-file reselection for unretained/missing copies, supported text PDFs, cross-page selection rejection, no OCR, AI behavior, vendor update procedure, and browser verification results. Explain quotas, removal retaining notes, loss on uninstall/data clearing, and that JSON backups exclude PDFs. Do not claim browser checks that were not run.
- [ ] With the required Node version, run `npm run format:check`, `npm run lint`, `npm test`, `npm run test:coverage`, `npm run compile`, `npm run build`, `npm run build:firefox`, `npm run validate:firefox`, `npm run test:packaging`, and `npm run test:e2e`. Expected: zero failures; inspect reports for skips and asset/CSP errors.
- [ ] Load the built Chrome and Firefox extensions and verify a public remote PDF, local-file fallback/reselection, retained offline reopening after restart, saved-PDF removal with notes intact, save/edit/delete, popup/library navigation, zoom/rotation, and a normal webpage. Firefox PDF behavior requires a real Firefox check: the current Playwright harness exercises Chromium only. Record versions and any blocked manual checks.
- [ ] Review final changes against issue criteria as amended by the opt-in decision, then commit a focused `[Feature]: ...` change. Any PR should link #67, explain the explicit-open behavior and limitations, and report actual validation.

## Completion criteria

The user explicitly opens a text PDF in either supported browser, saves a note against the correct source, and sees it restored on the correct page after reload/rerender. Opting into **Keep PDF on this device** retains one local copy per hash and allows offline reopening without a URL fetch or file picker, including after restart. The library shows retained byte usage and can remove documents while preserving notes. Unretained/missing documents use clear URL/file fallback; quota failures never prevent note saving. Popup, commands, editing, library links, and local fallback work without changing default PDF handling or webpage highlighting. Packaging is fully local, JSON backups preserve notes/selectors but exclude PDFs, and both browser paths have evidence of verification.

## References and implementation cautions

- [PDF.js getting started](https://mozilla.github.io/pdf.js/getting_started/) distinguishes the display library from the full generic viewer distribution. Check the selected release's actual APIs/assets rather than coding against `master` examples.
- [Mozilla content-script limitations](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#limitations): built-in PDF viewers remain privileged; the extension page owns this integration.
- Current repository baseline inspected: `0b8215c`. Planning changed no runtime code. Baseline investigation passed 30 existing DOM/restoration/return tests; that does not verify the proposed PDF feature. The investigation environment initially had Node `24.19.0` and no installed Playwright Chromium. Execution prepared Node `24.22.1`, Chromium, current Firefox and official Firefox 140 for validation.

## Execution staging

User requested separate PRs with a working result at each stage. The data-only first task is grouped with highlight integration instead of shipping inert selectors alone:

1. Explicit-open viewer, upstream controls, URL/file loading and unsupported states.
2. Optional IndexedDB retention and saved-PDF management.
3. PDF selectors, shared composer/editor and persistent page highlights.
4. Complete popup/command/library navigation, restoration hardening and cross-browser verification.

PRs are stacked in this order; no automatic merges. Execution evidence is recorded in each PR and in the final progress update.

## Implementation record

The original checkboxes above describe the design-time task breakdown. Delivery follows the functional PR stages below rather than shipping an inert data-contract PR first:

- [x] [#135](https://github.com/kevinc16/anchor-notes/pull/135): explicit-open reader, bundled upstream viewer, URL/file input and fallback. Uses the official compatibility distribution for Firefox ESR 140.
- [x] [#136](https://github.com/kevinc16/anchor-notes/pull/136): optional IndexedDB retention, offline reopening, deduplication and saved-copy removal that preserves notes.
- [x] [#137](https://github.com/kevinc16/anchor-notes/pull/137): page selectors, shared editor, multi-span capture and persistent PDF overlays.
- [ ] Final PR: popup/command/library navigation, exact-version fallback, stable geometry and whole-feature verification.

Implementation choices: the upstream viewer runs in a same-origin iframe; native IndexedDB uses a separate metadata store for efficient usage listings; storage integration is tested with real browser IndexedDB (including injected quota failures) rather than adding a mock dependency. Runtime code and document bytes stay local. JSON backups include notes/selectors and exclude retained documents. A fresh whole-feature code review identified three return-navigation issues; regression tests and fixes cover remote-file source preservation, clearing stale note-return parameters, and popup navigation across document versions. No minor findings were deferred.

Verification so far: 218 unit tests, type checking, formatting/lint and focused Chromium regressions pass. Firefox 140 and 157 native WebDriver smoke checks verify text rendering, note capture/save, IndexedDB retention and restored highlights after reopening. Final source archive and complete Chromium suite results are recorded in the final PR. Interactive manual browser testing is not claimed.
