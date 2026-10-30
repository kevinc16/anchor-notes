# Restore backup settings implementation plan

**Goal:** Implement issue #132 using existing settings normalization, note merge semantics, and credential storage.
**Spec:** https://github.com/kevinc16/anchor-notes/issues/132
**Architecture:** Validate backup structure before mutations. Normalize supplied settings, merge notes by ID without modifying timestamps, clear session credentials before replacing preferences, and refresh open extension views from storage events plus an explicit settings-restored message for identical imports. No dependency or schema change.

- [x] Add focused failing tests for normalization, settings round trips, legacy backups, malformed backups and credential transitions.
- [x] Implement settings validation and backup import using existing storage helpers. Reject malformed settings containers/encrypted credentials before changing storage; normalize invalid individual preferences to defaults. Strip unknown settings fields so session secrets and passphrases cannot enter backups.
- [x] Connect import UI, explain replacement behavior, refresh Settings forms and popup data on storage changes.
- [x] Add browser coverage for importing preferences into already-open surfaces, encrypted credentials, note-only backups and export round trips; prove no automatic provider request.
- [x] Run formatting, lint, unit coverage, TypeScript, Chromium E2E, Chrome/Firefox builds and manifest validation. Report manual browser limitations honestly.

Review focus: malformed encrypted credentials, unknown/session-only fields, stale form drafts, storage failures before persistence, and preserving note IDs/timestamps.


## Verification

Validated with Node 24.22.1: formatting, lint, strict TypeScript, 180 unit tests with coverage, 54 Chromium E2E tests, Chrome and Firefox production builds, and Firefox manifest validation.

A Firefox WebDriver smoke check temporarily installed the built extension, imported synthetic preferences and a synthetic note, checked the live Settings form, and verified restored highlight coverage on a normal local webpage without a consent prompt. Browser checks were headless; interactive manual checks were not run.

Review found stale unsaved drafts in another open Settings tab when imported settings were identical to saved settings. An explicit message now resets those forms, covered by the Chromium regression test. The full E2E suite also caught session-storage access in content scripts; keeping credential-dependent backup orchestration in `lib/backup.ts` avoids importing it into shared content-script storage code.
