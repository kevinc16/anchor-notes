# Development reference

[Back to README](../README.md)

Setup and browser loading instructions are in the [README](../README.md#install-for-development). Use Node.js 24 LTS (24.22.1 or newer within 24.x), pinned in `.nvmrc`.

## Tooling

- **WXT** owns extension entrypoints, manifest generation, development mode, and packaging.
- **Vite** is WXT's bundler and runs the Tailwind and React plugins.
- **React** powers the toolbar popup and full-page notes library.
- **TypeScript** provides strict types for notes, storage, messages, and browser APIs.
- **Tailwind CSS v4** styles both React entrypoints through its Vite plugin.
- **ESLint** checks TypeScript and TSX with the recommended `typescript-eslint` rules.
- **Stylelint** checks project CSS while recognizing Tailwind CSS v4 directives.
- **Prettier** formats TypeScript, TSX, and CSS consistently.

Useful commands:

```sh
npm run dev       # watch and rebuild Chrome and Firefox extensions
npm run dev:chrome # watch and rebuild the Chrome development extension
npm run dev:firefox # watch and rebuild the Firefox development extension
npm run format    # format TypeScript, TSX, and CSS
npm run format:check # check formatting without changing files
npm run lint      # lint TypeScript, TSX, and CSS
npm run lint:fix  # format and automatically fix lint violations where supported
npm test          # run the Vitest suite
npm run test:coverage # run unit tests and write the coverage reports
npm run compile   # run strict TypeScript checks
npm run test:e2e  # build and run Chromium E2E tests
npm run test:e2e:headed # build and run E2E tests with a visible browser
npm run build     # create .output/chrome-mv3
npm run build:firefox # create .output/firefox-mv2
npm run validate:firefox # validate the generated Firefox manifest
npm run zip       # create a store-ready extension archive
npm run zip:firefox # create Firefox extension and source archives
npm run test:packaging # check archive contents and rebuild extracted sources
```

Before handing off a change, run `npm run format:check`, `npm run lint`, `npm test`, and `npm run compile`. See [AGENTS.md](../AGENTS.md#testing-expectations) for additional checks required by the change.

### Source packaging

`npm run zip:firefox` creates both an extension ZIP and a source ZIP in `.output/`. Source packaging requires Git and a checkout with tracked build inputs: only tracked files from the source/build allowlist in `wxt.config.ts` are included, using their current working-tree contents. Add intended new source files to Git before packaging. Untracked files and generated reports are excluded, including files inside source directories; hidden files are excluded except the explicitly included `.nvmrc` runtime pin.

To reproduce the Firefox build from a source ZIP, extract it into an empty directory, select Node.js using `nvm install` and `nvm use`, then run `npm ci`, `npm run build:firefox`, and `npm run validate:firefox`. Building extracted sources does not require Git metadata. Tailwind scans only the runtime source directories so development-only documentation and tests cannot change the generated CSS. The source ZIP contains build inputs and build instructions; test suites and development reports are not part of it.

`npm run test:packaging` requires Git and `unzip`. It packages a temporary checkout containing synthetic local files and reports, verifies the source and extension ZIP contents, then extracts the sources and rebuilds Firefox without Git metadata, using the installed dependencies. All temporary files are removed. CI runs this check in the Firefox job.

### Unit test coverage

`npm run test:coverage` runs the Vitest suite with the V8 coverage provider. It measures the browser-independent code in `lib/**/*.ts`, excluding the type-only `lib/types.ts` contract, and writes reports to the ignored `coverage/` directory. The text summary is saved as `coverage/coverage-summary.txt`, the detailed HTML report is available at `coverage/index.html`, and `coverage/lcov.info` is available for coverage tooling.

CI runs this command for pull requests and pushes to `main`, adds the concise summary to the workflow summary, and uploads the full `coverage/` directory as a build artifact. Coverage is advisory for now: CI fails when tests or report generation fail, but no percentage threshold fails the job. The initial baseline on `main` (2026-09-01) is 71.34% statements, 70.32% branches, 69.04% functions, and 74.50% lines (122/171 statements, 64/91 branches, 29/42 functions, and 114/153 lines). Revisit the baseline before introducing enforced thresholds.

### Playwright E2E CI

Only the E2E job in `.github/workflows/ci.yml` runs in the official Playwright container (`mcr.microsoft.com/playwright:v1.64.1-noble`), which includes browser binaries and system dependencies. The job still uses Node.js 24, `npm ci`, the extension build, and the existing persistent Chromium context with extension loading. Other CI jobs run directly on GitHub-hosted runners.

When upgrading Playwright, update `@playwright/test` and regenerate `package-lock.json`, then set the E2E container image to the exact resolved `playwright` version in that lockfile, retaining the `-noble` suffix. Check the resolved version with `node -p "require('./package-lock.json').packages['node_modules/playwright'].version"`. The image and dependency versions must match so Playwright can find the bundled browsers; do not add a browser or APT installation step to this job. Run the complete E2E suite in GitHub Actions after upgrading, including responsive navigation cases, and check the uploaded reports and diagnostics.

### Playwright monitoring with Checkly

The report publishing job can upload Chromium E2E results to [Checkly Test Sessions](https://www.checklyhq.com/docs/detect/testing/playwright-reporter/) using the official `@checkly/playwright-reporter`. To enable it, configure these values in the **prod** environment under **Settings → Environments → prod**:

- **Secret** `CHECKLY_API_KEY`: a Checkly API key with access to the intended account.
- **Variable** `CHECKLY_ACCOUNT_ID`: the account ID from Checkly's account settings, added under **Environment variables**.
- **Variable** `CHECKLY_UPLOAD`: set to `true` to enable uploads; set to `false` to disable them.

Uploads run on pushes to `main` and same-repository pull requests targeting `main`, when the `prod` environment has both credentials configured and `CHECKLY_UPLOAD=true`. Fork PRs and runs without credentials skip uploads. Local runs do not upload by default, even if Checkly credentials are present: the reporter requires `CI=true`, `CHECKLY_UPLOAD=true`, and both credentials. Keep credentials out of local configuration files and source control.

The test job only generates local HTML and blob reports, then saves them as GitHub artifacts. The separate **Publish Playwright report** job downloads those artifacts and uploads them to Checkly using `playwright merge-reports`; it runs after successful or failed tests without rerunning them. Only this publishing job selects the `prod` environment and passes Checkly credentials to the upload step. Checkly records the available test results, screenshots, traces, and videos. Git metadata is detected by the reporter; the session name includes the branch and GitHub run ID/attempt. Open the session through the **Checkly** section in the workflow summary or the existing Playwright PR comment. CI continues to generate the HTML report and retain GitHub artifacts for 14 days.

The browser test step preserves Playwright's exit status. Upload errors remain visible in the separate publishing job; when an enabled upload produces no session link, the summary reports it as unavailable and emits a warning. Missing credentials skip reporting without failing tests. A terminated job may not finish uploading. This integration monitors CI runs; it does not schedule extension tests in Checkly's hosted browsers or configure alerts.

Only run this suite against its synthetic fixtures and temporary browser profiles. The reporter scrubs recognized secret environment values and sensitive HTTP headers from reports and traces. Screenshots and videos can still show everything rendered on screen, so never use real notes, private webpages, or live provider credentials in these tests. Inspect artifacts before enabling uploads or adding new fixtures.

To verify setup, run a trusted CI build and confirm its session and artifacts are accessible. Also verify a deliberately failing test uploads its diagnostics while CI remains failed, and confirm a run without Checkly secrets still produces GitHub artifacts. The local unit suite covers upload gating and session-link reporting without contacting Checkly.

## Project layout

```text
entrypoints/
  background.ts         # commands, context menu, persistence orchestration
  anchor.content/       # selection capture and resilient restoration
  popup/                # React current-page notes app
  options/              # React library and settings app
lib/                    # typed storage, note models, and organization logic
styles/                 # shared Tailwind theme and base styles
public/                 # extension icons copied into the build
wxt.config.ts           # manifest, React module, and Tailwind/Vite config
```

## UI state management

The popup and library use the typed Zustand stores in [`lib/ui-stores.ts`](../lib/ui-stores.ts):

- `useDataStore` caches the latest normalized `AnchorData` snapshot and tracks read status. Entrypoints call `loadData(readData)` on mount and after successful writes. A failed read keeps the previous snapshot and exposes a generic error without provider details.
- `useLibraryStore` owns library navigation, search, topic filtering, sorting, grouping, and collapsed websites. Derived note lists remain computed from the snapshot and these controls.

Stores are in-memory and scoped to each extension page. Popup and options pages have separate JavaScript contexts; they share the store definition, not a live instance. There is no Zustand persistence middleware, browser localStorage mirror, or automatic cross-page synchronization. Browser extension local storage remains the source of truth through [`lib/storage.ts`](../lib/storage.ts), which still normalizes reads and writes. Existing runtime messages continue to handle content-script/background operations; stores do not call browser APIs or send messages.

Settings and note edit drafts remain component-local. API key drafts, passphrases, and decrypted credentials never enter Zustand. The snapshot contains only the already-persisted settings; encrypted keys remain ciphertext, and unlocked keys stay in extension session storage through the existing credential helpers. Changing a UI control does not write data; save, delete, and import handlers persist through the existing helpers and then refresh the snapshot.
