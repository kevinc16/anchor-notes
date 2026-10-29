# Optional AI prompt implementation plan

**Goal:** Implement issue #82 in the existing explicit library regeneration flow for one or multiple selected notes.

**Architecture:** Carry an optional string from the library runtime message through bulk generation and summary generation into the provider's user message. Keep the system instructions and omitted/blank request unchanged. Hold guidance only in component/request memory, never in notes, settings, batch metadata, or backups.

**Spec:** https://github.com/kevinc16/anchor-notes/issues/82

## Constraints and review focus

- Reuse configured providers, credentials, AI gates, and Firefox consent.
- Preserve failure, intervening edit, deletion, and duplicate-request protections.
- A batch shares guidance but sends each selected note independently.
- Retry uses the current field; reopening the library clears guidance.
- Reject non-string runtime guidance without exposing its contents.

## Tasks

- [x] Add focused provider tests for omitted/blank prompts and guidance with unchanged system instructions and structured response parsing; observe the guidance test fail, then add the optional argument.
- [x] Add batch tests for request isolation and absence of guidance in storage, and exercise failure/edit/deletion with guidance. Thread the optional argument through the existing lifecycle and validate the runtime message.
- [x] Add browser coverage for labeled prompt entry, single-note and batch submission, retries, and clearing on reload. Add the ephemeral textarea and document the explicit flow.
- [x] Run formatting, lint, unit coverage, strict compilation, Chromium E2E, both builds, and Firefox manifest validation. Review the final diff.

## Verification

- Node 24.22.1: 148 unit tests passed with coverage; all 53 Chromium browser tests passed.
- Formatting, lint, TypeScript, Chrome/Firefox builds, and Firefox manifest validation passed.
- The sandbox caused two existing Checkly subprocess stdout assertions to fail; the full coverage run outside the sandbox passed without source changes.
- Independent review found no blocking issues. Its retry-payload test suggestion was incorporated.
- Inspected the narrow Chromium UI screenshot. Firefox was build/manifest checked; no Firefox browser was available for manual verification.
