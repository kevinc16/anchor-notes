## Summary

<!-- What changed and why? -->

## Related issue

<!-- Link the issue this PR addresses, for example: Closes #123 -->

## User-visible changes

<!-- Describe any behavior, UI, storage, or documentation changes users will notice. -->

## Scope

- [ ] This PR has one clear purpose.
- [ ] Unrelated refactors and generated output are excluded.
- [ ] Shared types, storage normalization, and runtime messages remain compatible, or migrations are covered.

## Verification

- [ ] `npm test`
- [ ] `npm run compile`
- [ ] `npm run build` (when changing WXT configuration, manifest permissions, entrypoints, imports, or packaging)
- [ ] `npm run test:e2e` (when changing browser-facing behavior or the E2E harness)
- [ ] Manual verification in Chrome (when changing the popup, options page, content script, or other browser-facing behavior)

## Privacy and security

- [ ] No API keys, private note contents, or sensitive URLs were logged, committed, or added unnecessarily to fixtures/screenshots.
- [ ] Core highlighting, saving, searching, and restoration remain local-only unless the change explicitly concerns an optional provider.
- [ ] Any provider, storage, permission, or data-flow change is documented and covered by tests where practical.

## Screenshots or recordings

<!-- Include before/after visuals for UI changes, with sensitive content redacted. Remove this section if not applicable. -->

## Reviewer notes

<!-- Call out tradeoffs, limitations, follow-up issues, or areas that need particular attention. -->
