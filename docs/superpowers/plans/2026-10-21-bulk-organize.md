# Bulk library organization implementation plan

**Goal:** Implement issue #51, using its reviewed issue body as the specification. Optional prompts remain in #82.

**Architecture:** Extend existing library state with temporary selected IDs. Send tag patches and regeneration requests to the background. Reuse serialized storage mutations and per-note generation with a session-only batch record, two workers, conflict-safe writes, and explicit outcomes. No dependencies or note schema changes.

## Tasks

- [x] Add failing tests for normalized bulk tag patches, current-value preservation, missing notes, and selection/filter behavior. Implement in storage and UI store.
- [x] Add failing generation/batch tests for failures preserving old metadata, duplicates, bounded concurrency, stale results, interruption, and gating. Implement explicit outcomes and a session-only batch coordinator with typed runtime messages.
- [x] Add browser regression tests for selection in both layouts, tag actions, AI progress/failure/retry, and reopening. Implement the selection toolbar and batch status UI.
- [x] Document explicit existing-note AI regeneration, then run formatting, lint, unit coverage, compilation, builds, Firefox manifest validation, and Chromium E2E. Review the final diff and report any manual verification limitations.

## Constraints and review focus

- Never send notes for local tag editing; respect AI enablement, credential locks, and Firefox consent for explicit regeneration.
- Preserve IDs, creation timestamps, unrelated edits, deleted notes, and existing values on generation failure.
- Select all includes filtered notes in collapsed groups; search/topic changes clear selection, sorting/group collapse do not.
- Duplicate starts must not overwrite an active batch; failed-only retry must exclude successful items.
- Persist only IDs/statuses for batches in session storage, never note text, credentials, or prompts. Recover interrupted work as failed rather than leaving spinners.

## Verification results

- Formatting, ESLint/Stylelint, 112 unit tests with coverage, and strict TypeScript compilation passed.
- Chrome and Firefox builds and Firefox manifest validation passed.
- Four new Chromium browser regressions passed, including desktop/narrow layout checks, partial failures/retry, overlapping batches, and edit/delete conflicts. The full Chromium suite passed: 34 tests.
- Reviewed desktop and narrow-screen browser screenshots.
- Independent review findings were fixed and regression-tested: queued work rechecks privacy/credential gates; session cleanup failures do not misreport committed generation.
- Manual Firefox UI verification was unavailable because computer-use access to Firefox was not approved. No live provider or real note data was used in testing.
