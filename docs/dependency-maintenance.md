# Runtime and dependency maintenance

Reviewed 2026-10-27 for [issue #104](https://github.com/kevinc16/anchor-notes/issues/104).

## Runtime

Use Node.js **24.22.1** (Krypton). Node 24 is in Maintenance LTS as of this review and supported until **2028-04-30**. Node 26 is still Current on the review date, with LTS scheduled for 2026-10-28, so it is not the baseline for this update. Sources: [official release status](https://nodejs.org/en/about/previous-releases), [release schedule](https://github.com/nodejs/Release/blob/main/schedule.json), and [published versions](https://nodejs.org/dist/index.json).

`.nvmrc` pins the tested release, every CI `setup-node` step reads it (including E2E and report publishing), `engines.node` supports 24.22.1 through 24.x, and `@types/node` stays on major 24. To advance the runtime, update those together and rerun clean installation, lint, tests/coverage, typecheck, both browser builds, Firefox manifest validation, and E2E tests. The Playwright image supplies browsers and OS libraries; `setup-node` selects the repository runtime inside it.

## Dependency review

Inspected stable npm dist-tags, engine requirements, and peer constraints for every direct package, then used `npm install` and `npm update` to refresh the lockfile within compatible ranges. No forced audit upgrade or dependency overrides were used.

| Package | Previous range | Updated range |
| --- | --- | --- |
| `react` | ^19.2.8 | ^19.3.1 |
| `react-dom` | ^19.2.8 | ^19.3.1 |
| `zustand` | ^5.0.15 | ^5.0.16 |
| `@checkly/playwright-reporter` | ^1.14.0 | ^1.15.0 |
| `@playwright/test` | ^1.62.1 | ^1.64.1 |
| `@types/node` | ^26.4.0 | ^24.19.2 |
| `@types/react` | ^19.2.18 | ^19.3.0 |
| `@types/react-dom` | ^19.2.5 | ^19.3.0 |
| `@vitest/coverage-v8` | ^4.1.11 | ^5.0.5 |
| `eslint` | ^10.9.1 | ^10.13.0 |
| `globals` | ^17.11.0 | ^17.13.0 |
| `happy-dom` | ^20.11.12 | ^21.0.4 |
| `prettier` | ^3.9.6 | ^3.9.10 |
| `stylelint` | ^17.14.1 | ^17.16.0 |
| `typescript-eslint` | ^8.69.0 | ^8.72.1 |
| `vite` | ^8.2.2 | ^8.3.5 |
| `vitest` | ^4.1.11 | ^5.0.5 |
| `wxt` | ^0.21.4 | ^0.21.5 |

Unchanged direct packages were already at the current compatible stable release. In particular, Tailwind and its Vite plugin remain paired at 4.3.3, and WXT's React module remains at 1.2.2.

### Migration checks and deferred upgrades

- **TypeScript 7.0.2 deferred:** typescript-eslint 8.72.1 declares `typescript >=4.8.4 <6.1.0`, so keep TypeScript 6.0.3 until that peer constraint supports 7. Node types intentionally target 24 instead of the latest major 26. Recheck with `npm view typescript-eslint peerDependencies` before advancing.
- **Vitest 5.0.5 and coverage 5.0.5:** reviewed the [Vitest 5 migration guide](https://vitest.dev/guide/migration/). Node 24 and Vite 8 meet prerequisites. The suite does not depend on cross-test mock call history, inline projects, or removed browser-runner APIs. Existing coverage include/exclude globs are relative to the root and remain applicable; verify the emitted file set after upgrading.
- **Happy DOM 21.0.4:** reviewed the [21.0.0 breaking changes](https://github.com/capricorn86/happy-dom/releases/tag/v21.0.0). CSS and iframe loading now default to disabled; the DOM unit tests use inline synthetic markup and need neither. Keep the safer defaults.
- **Playwright 1.64.1 and Checkly 1.15.0:** reviewed [Playwright release notes](https://playwright.dev/docs/release-notes); keep the persistent Chromium extension fixture and report configuration. The workflow image and README are updated together to `mcr.microsoft.com/playwright:v1.64.1-noble`. Preserve this exact image/dependency coupling on future upgrades.
- **Transitive packages:** `npm outdated --include=dev --all --json` was reviewed before and after updating. Afterward, 83 installed package entries still have newer releases, but none is below its parent's allowed `wanted` version. These are intentionally bounded by upstream dependency constraints, including Babel 7 vs 8, AJV 6 vs 8, and WXT's parser bindings. Do not force unrelated transitive major upgrades; advance them through compatible parent releases. Optional peers and binaries for other operating systems also appear in the full inventory and are not installed on this macOS host.

## Security review

Before updating, `npm audit --json` reported **9 affected package entries** (5 high, 4 moderate). They covered Happy DOM code execution; Vitest mock registration and traversal; Vite development-server/editor integration; brace-expansion denial of service; fast-uri normalization/injection; PostCSS selector parsing; and source-map-js denial of service. These counts include propagated dependency entries, not nine distinct advisories.

After updating direct and compatible transitive dependencies, `npm audit --json` reports **0 known advisories** for this lockfile on the review date. No advisory is currently deferred. This is a point-in-time npm database result, not a claim that the dependency tree is vulnerability-free. Re-run `npm audit` during future upgrades and review new findings in context; never use `npm audit fix --force` without reviewing compatibility.

To reproduce the inventory, run `npm ci`, `npm outdated --include=dev`, `npm outdated --include=dev --all`, and `npm audit` under the pinned runtime. `npm outdated` exits nonzero when newer packages exist, including the intentional TypeScript and Node-type deferrals.
