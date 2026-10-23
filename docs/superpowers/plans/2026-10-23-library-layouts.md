# Library layouts implementation plan

Goal: implement approved issue #87: Cards (240-character previews) and List (1,200-character previews, quote width capped at 70ch), using the existing note component.

Architecture: store layout in the library Zustand store; options-page browser I/O reads/writes a separate `anchorNotesLibraryLayout` key in extension-local storage. Missing/invalid values default to Cards. No note/schema/provider changes.

- [x] Add failing store tests for preference normalization and preserving filters, grouping, selection; add browser coverage for switching, long quotes, persistence/fallback, keyboard access and narrow windows.
- [x] Implement validated layout state, preference loading/writing, labeled pressed buttons, responsive shared renderer variants in both grouped and ungrouped containers. Preserve mounted note identity and expansion.
- [x] Run focused tests then required formatting, lint, unit coverage, compilation, Chromium E2E, Chrome/Firefox builds and Firefox validation. Inspect synthetic-note screenshots. Record unavailable manual browser checks accurately.

Review focus: corrupt/missing preferences, failed storage, late preference reads, selection and collapsed groups, very long unbroken text, controls at narrow widths.

Execution: inline in the current checkout on a dedicated issue branch; the existing untracked store-assets directory is unrelated and stays untouched. The user approved the investigation's concrete design and requested implementation, so no further design approval is needed.

Verification: 121 unit tests with coverage and 37 Chromium E2E tests passed, as did formatting, lint, strict compilation, Chrome and Firefox builds, Firefox manifest validation and independent review. Manual Firefox UI verification could not run because Computer Use access to Firefox was not approved. Existing navigation overflow at 320px is tracked separately as #96; List checks cover 375px and 640px (the CSS viewport width of a 1280px window at 200% browser zoom), plus desktop. Actual browser zoom remains a manual check.
