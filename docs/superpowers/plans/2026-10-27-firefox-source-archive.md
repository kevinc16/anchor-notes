# Firefox source archive fix — issue #121

Goal: source ZIPs contain intended build inputs, never unrelated untracked files or generated reports. The user's implementation request follows the investigated root cause and proposed allowlist plus archive/rebuild check.

Approach: use WXT's source ZIP hook to select tracked files from explicit source/build/documentation paths. Git is required only for source packaging; extracted sources must build without Git metadata. A denylist alone cannot exclude arbitrary private local filenames. Directory globs alone would still include stray files inside source directories.

- [x] Add a separate packaging check using a temporary Git checkout, harmless unwanted files (including inside source directories), ZIP inspection, and a rebuild without Git metadata. Run it against the current configuration and observe rejection of contamination.
- [x] Restrict WXT source inclusion to tracked build inputs, explicitly including `.nvmrc` and the lockfile. Fail closed if inputs cannot be determined.
- [x] Add `test:packaging` to the Firefox CI job and document packaging prerequisites and rebuild instructions.
- [x] Run formatting, lint, unit tests, compilation, Chrome/Firefox builds, Firefox manifest validation, and the packaging check on Node 24.22.1. Review the complete diff before handoff.

Constraints: no runtime behavior, permissions, data contracts, dependency versions, or unrelated files change. Keep normal builds independent of Git. Test archives contain only repository sources and synthetic contamination, are never uploaded, and are removed afterward.

Review focus: required icons/components/styles and lockfile present; `.nvmrc` present without hidden credentials; ignored and untracked files absent even under source directories; missing Git/index data fails closed; extracted archive rebuilds without `.git`.

Rebuild finding: automatic Tailwind scanning added unused `static` and `collapse` utilities from tests and planning documents, which are absent from the source archive. Scope Tailwind scanning to runtime source directories to make build outputs identical. The packaging regression compares every Firefox output byte and remains red until that input mismatch is corrected. Run Chromium E2E because this changes CSS generation.

Verification: Node 24.22.1; formatting, ESLint/Stylelint, 142 unit tests (also with coverage), strict compilation, Chrome/Firefox builds, Firefox manifest validation, and all 52 Chromium E2E tests passed. The packaging check rejects synthetic contamination and verifies byte-identical Firefox output from extracted sources; a separate clean `npm ci --offline` plus Firefox build and manifest validation also passed.

Independent review found one literal-glob escaping omission for pipe characters. A real ZIP contamination regression reproduced it, the escaping was corrected (including quote characters), and packaging plus formatting/lint/unit/type checks passed again. No further review defects were found. Installed Chrome/Firefox manual verification was not performed.
