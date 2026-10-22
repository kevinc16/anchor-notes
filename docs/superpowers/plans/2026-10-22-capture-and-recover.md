# Simple capture and recovery project plan

**Date:** 2026-10-22
**Status:** Planned; product changes have not been implemented or benchmarked.
**Goal:** Capture and recover an idea with very little effort.
**Basis:** Kevin's requested product direction: save a passage and why it matters; find it without remembering the website; return to its context; export the notes needed for a piece of work.
**Architecture:** Improve the existing content-script composer, local library, source-return flow, and export actions. Reuse saved titles, quotes, bodies, tags, anchors, and bulk selection. Keep deterministic transformations in `lib/` and browser interactions in entrypoints.
**Tech stack:** Existing WXT, React, TypeScript, Tailwind CSS, Zustand, Vitest, and Playwright; no new dependency is required by this plan.

This is the project-level plan for four separate milestones. Each milestone should produce an independently useful change. Before implementation, create or reuse a feature issue using `.github/ISSUE_TEMPLATE/feature_request.md`, apply existing repository labels, settle that milestone's detailed interaction design, and prepare a focused implementation plan. Use separate PRs for separate features; record any discovered bug separately using the bug template. This document does not authorize executing all milestones or creating a single umbrella implementation PR.

## Product decision rule

Prioritize improvements that reduce time, steps, or uncertainty in these four tasks. Evaluate proposals against those outcomes rather than the number of features offered by another product. Keep Anchor's warm visual style and focus on passages with personal notes.

| User task | Successful outcome | Current foundation | Main gap to investigate or close |
| --- | --- | --- | --- |
| Save a passage and add why it matters | The passage and personal note are saved together, with clear confirmation | Selection capture, focused note field, right-click and keyboard entry, local persistence | Establish actual friction and strengthen keyboard flow and save feedback where needed |
| Find an idea without remembering the website | A meaningful phrase or tag leads to the right passage and recognizable source | Local search over quote, body, title, URL, and tags; topic filters | Titles are hidden on cards, only seven tags are directly exposed, summaries are not searched, and search uses one literal substring |
| Return to the passage and understand context | The original page opens at the saved passage, or the user understands why that cannot happen | Quote/context restoration, return intent, source opening and scrolling | Make source identity and restoration outcomes understandable; verify reliability on changing pages |
| Export notes for a piece of work | An explicitly chosen set becomes useful, attributable material outside Anchor | Bulk selection and full-library JSON backup | No task-oriented export of a selected subset |

## Constraints

- Saving, searching, highlighting, restoring, and exporting remain local and usable with AI disabled. Do not add remote requests to these paths.
- Preserve optional provider controls, credential protections, and Firefox consent. No provider is needed for this plan's acceptance criteria.
- Preserve note IDs, creation timestamps, stored quotes, anchors, and existing JSON backup/import compatibility. Display changes must not rewrite note data.
- Reuse the current selection semantics: changing search/topic clears selection; sorting and grouping preserve it; matching notes in collapsed groups are selectable.
- Treat quotations, personal notes, URLs, and provider credentials as sensitive. Use synthetic notes, temporary profiles, and manual local measurements; add no usage telemetry.
- Reuse existing theme tokens and accessible native controls. No broad state-management or styling rewrite.
- Browser-internal pages may reject content scripts, and removed or rewritten passages may be impossible to restore. Retain the saved note and provide honest fallback behavior.

## Measurement before implementation

- [ ] Prepare a repeatable synthetic library of 100 notes across at least 10 websites, with several articles on the same host, 20 distinct tags, long quotations, and personal notes. Include a passage identifiable only through its personal note and one through its summary.
- [ ] Record a baseline for all four tasks using the current extension in a temporary browser profile, with AI disabled. Include first-use and repeat-use observations separately.
- [ ] Record completion, elapsed time, actions, wrong turns, and needed assistance. Start timing after the webpage or library is ready; record page-load delay separately for source return.
- [ ] After each milestone, repeat the same tasks and compare results. If possible, counterbalance task examples and test with at least five people; a maintainer-only run is a smoke check, not evidence of general usability.

The following are initial evaluation targets, not current performance claims. Revisit them after collecting the baseline and document any adjustment with its reason.

| Task | Timing boundaries | Initial target for repeat use |
| --- | --- | --- |
| Capture | Start with text selected; end when save confirmation is visible. Supply a short personal note in the task script. | At most 15 seconds; one composer, no settings detour |
| Find | Start in the loaded library with no filters; end when the correct passage is identified | At most 30 seconds using an idea cue that contains a remembered word or tag; no remembered website required |
| Return | Start with the saved note identified; measure interaction time separately from source-page readiness | One explicit source action; passage centered within 5 seconds after a static fixture is ready |
| Export | Start with the loaded library; end with the requested subset downloaded | At most 30 seconds for a scripted five-note subset; no manual deletion of unrelated notes afterward |

Use at least four successful unassisted completions out of five as an initial small-study signal when five participants are available. Report individual observations and failures as well as medians; this sample is not a population-level guarantee. Automated checks verify correctness, not human task speed.

## Milestone 1: Save a passage and its meaning

**Desired experience:** Select text, invoke Anchor, write a short reason, save, and continue reading with confidence.

**Approach:** Keep the existing composer and optional “Why does this matter?” prompt. Audit before adding controls: the field already receives focus, and both context-menu and keyboard capture exist. Improve only observed friction, including an accessible note-field label, an explicit keyboard save action if needed, clear pending/success/failure feedback, and preservation of the draft when saving fails. Keep ordinary multiline typing available.

**Relevant files:** `entrypoints/anchor.content/index.ts`, `entrypoints/anchor.content/style.css`, `entrypoints/background.ts`; regressions in `tests/e2e/highlighting.spec.ts` and `tests/e2e/interaction-states.spec.ts`.

**Acceptance criteria:**

- [ ] Capture through the existing shortcut and context-menu paths opens one composer with the exact selected quote and focused personal-note field.
- [ ] A keyboard-only user can enter a multiline note, save, and cancel; any new shortcut is visibly explained and does not replace normal newline entry.
- [ ] The saved quote and personal note appear in the library and remain after reopening the extension.
- [ ] Confirmation reflects successful persistence. A failed save keeps a recoverable draft and provides a retry path without duplicate notes.
- [ ] The task works with AI disabled and no provider credentials. Optional generation never blocks successful local capture.
- [ ] Compare capture-task results with the baseline and the initial target.

## Milestone 2: Find and recognize an idea

**Desired experience:** Search for what you remember, recognize the passage and article, and see why you saved it.

**Approach:** Show the stored article title on each library card, with a hostname fallback for missing titles. Preserve the quotation as the main content and distinguish personal notes from summaries. Keep frequent-tag shortcuts and add searchable access to all tags; clicking a card tag applies the existing exact-tag filter. Show active filters, matching-note count, and a clear reset action.

Extend deterministic local search to summaries and whitespace-separated, case-insensitive terms: every term must occur somewhere across the searchable fields, regardless of term order. Empty/whitespace-only queries match all notes subject to the selected tag. This supports remembered words; it does not promise synonym or semantic matching. Preserve exact-tag filtering separately from free-text search.

Raise meaningful metadata to approximately 12px and personal notes/summaries to 13–14px using the existing theme. Validate the resulting density rather than globally enlarging every label. An optional Cards/List layout is a follow-up within this task area if reading long results remains cumbersome; it should preserve filters and selection and reuse the same note presentation logic.

**Relevant files:** `entrypoints/options/App.tsx`, `lib/storage.ts` (`noteMatches`), `lib/ui-stores.ts`, `styles/app.css`; focused search/tag unit tests and `tests/e2e/note-management.spec.ts`. A later list layout also touches `lib/note-preview.ts` and its existing tests if preview rules change.

**Acceptance criteria:**

- [ ] Find a passage by quotation, personal note, article title, tag, or summary without entering a website name.
- [ ] Multi-term queries work across fields and word order; empty queries and non-Latin text remain usable without an English-only tokenizer.
- [ ] A tag outside the seven most frequent tags can be found and selected; the active tag remains visible and can be cleared.
- [ ] Two articles on one hostname can be distinguished by title; missing and very long titles remain usable at narrow widths.
- [ ] Result counts, clear actions, and zero-result guidance accurately reflect combined search/tag state.
- [ ] Controls work with a keyboard and at 200% zoom. New filter behavior preserves the documented bulk-selection rules.
- [ ] Compare retrieval-task results with the baseline. Add a list layout only with a specific long-passage reading criterion and separate issue/PR.

## Milestone 3: Return to original context confidently

**Desired experience:** Choose “Return to source,” see the original passage in its surrounding page, and understand any limitation.

**Approach:** Build on the existing source-return and quote/context restoration. Expose recognizable article identity before leaving the library. Review whether the current highlight is sufficiently apparent after scrolling; add a brief focus cue only if testing shows it is needed. Design explicit outcome feedback for successful return, a missing passage, and pages where content scripts cannot run. Any feedback must respect the asynchronous lifecycle: an early miss must not misreport failure while content is still loading.

**Relevant files:** `entrypoints/options/App.tsx`, `entrypoints/background.ts`, `entrypoints/anchor.content/index.ts`, `entrypoints/anchor.content/style.css`, `lib/types.ts` if outcome messages are required; existing `tests/e2e/return-to-source.spec.ts`, `tests/e2e/dynamic-restoration.spec.ts`, and highlight-restoration unit tests.

**Acceptance criteria:**

- [ ] An explicit source action opens the original URL and centers the correct passage on a normal static webpage.
- [ ] Restoration still identifies a multi-node quotation after surrounding markup changes and distinguishes repeated quotes using stored context.
- [ ] Delayed page content can restore without a premature permanent failure; later DOM changes do not repeatedly steal the user's scroll position.
- [ ] If the passage was removed or cannot be restored, the saved quote and personal note remain available and the outcome is understandable.
- [ ] Unsupported pages open through a usable fallback without an uncaught error or a false success indication. Define the feedback location in this milestone's interaction design.
- [ ] Existing modifier-key/new-tab behavior remains intact, and an ordinary later visit does not replay a consumed return intent.
- [ ] Compare source-return task results with the baseline; report navigation delay and restoration delay separately.

## Milestone 4: Export the notes needed for work

**Desired experience:** Choose the relevant notes, export, and paste or open an attributable set in a writing or research workflow.

**Approach:** Add “Export selected notes” to the existing selection workflow, initially as a UTF-8 Markdown download. Include only the chosen notes, in their current visible sort order, including selections inside collapsed groups. Each entry contains article title (hostname fallback), original URL, saved date, full quotation, personal note, tags, and an optional clearly labeled summary. Preserve meaningful line breaks and safely represent Markdown-special characters in titles, links, and multiline quotes.

Use an explicit selected count, disable the action when selection is empty, and produce a deterministic file for a given note set and order. Perform export locally with the browser download pattern already used by the backup action. Exporting must not mutate notes or regenerate anything. Keep “Export backup (JSON)” distinct and retain its current import compatibility; selected-note Markdown is a working document, not a restorable backup.

**Relevant files:** `entrypoints/options/BulkActions.tsx`, `entrypoints/options/App.tsx`; add `lib/note-export.ts` for a pure Markdown formatter, `tests/note-export.test.ts`, and `tests/e2e/note-export.spec.ts`. Reuse `AnchorNote` and selected IDs; keep browser downloads out of the formatter.

**Acceptance criteria:**

- [ ] Download exactly the selected subset; include selected notes in collapsed groups and exclude unrelated notes.
- [ ] Include full quotes rather than card previews, with source attribution and personal notes intact.
- [ ] A note removed before export is excluded from the current snapshot and the displayed count remains truthful.
- [ ] Markdown handles Unicode, multiline passages, special characters, empty optional fields, and long URLs without losing source text.
- [ ] Working exports contain no provider settings, credentials, encrypted secrets, session statuses, or unselected note data.
- [ ] Empty selection cannot trigger an export. Export does not change IDs, timestamps, tags, or content.
- [ ] Existing full JSON backup/import regression tests continue to pass unchanged in meaning.
- [ ] Compare export-task results with the baseline and verify the file is useful in a Markdown editor without cleanup of unrelated data.

## Sequencing and release checks

1. Record the baseline first. Address confirmed capture failures separately as bugs; do not assume the existing composer needs a redesign.
2. Prioritize article recognition and complete tag access, then selected-note export: these close concrete gaps already visible in the implementation.
3. Strengthen return feedback and any remaining capture friction using the observed task results. Keep existing restoration regression coverage throughout.
4. Consider a list view after evaluating long passages. Consistent bundled SVG icons can accompany focused UI work, but are not an independent success metric.

For every implementation PR, run the required formatting, lint, unit, and strict TypeScript checks. Run unit coverage for library logic, Chromium E2E for browser-facing changes, and Chrome/Firefox builds plus Firefox manifest validation for entrypoint/import/packaging changes. Manually verify affected flows in Chrome and Firefox on normal webpages; record any unavailable verification explicitly.

## Deferred scope

Semantic/embedding search, scheduled reviews, reading streaks, a full document reader, cloud sync, collections, article-level grouping, and third-party export integrations are separate proposals. Introduce them only when measured failures in the four tasks justify the extra concepts or infrastructure. Existing longer-term roadmap ideas remain candidates rather than prerequisites.

## Completion record

- [ ] Baseline observations and synthetic task script recorded.
- [ ] Feature issues linked from the corresponding milestone before implementation.
- [ ] Each shipped milestone linked to its focused PR and verification evidence.
- [ ] Post-change task observations recorded, including missed targets and remaining friction.
- [ ] Product claims reflect demonstrated outcomes; unmeasured targets remain labeled as targets.
