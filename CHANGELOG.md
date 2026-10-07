# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Pick on a later Click runs every earlier node on the path from Start, so a Type step such as {{otp}} receives values from Capture, Set variable, database, and the rest. A failed step still leaves the picker open.
- Type writes into the input inside a custom element, so an OTP field receives the captured value when keystrokes land on the host.
- Capture no longer shows an Exchange button. The HTTP request node already owns that exchange.

## [2.0.10] — 2026-10-07

### Fixed

- Pick on a later Click still opens when an earlier Click or Type misses its element, and the click you make is stored even when the target is not a button.

## [2.0.9] — 2026-10-07

### Fixed

- Pick on page replays browser steps and skips HTTP request, Capture, and other API steps in between, so those nodes no longer cancel the picker.
- An HTTP request node sends the workspace cookie jar and the E2E browser session, uses the workspace proxy and TLS setting, and fails the step when the call cannot be sent.
- Capture reads a field inside a JSON string, such as `items[0].value.pin`.

## [2.0.8] — 2026-10-07

### Fixed

- A Set variable can be used in a later request URL, such as `google.at/{{username}}`. The field keeps the token; the request is sent with the value.

## [2.0.7] — 2026-10-07

### Fixed

- Picking a CSS selector keeps `{{name}}` in the Open browser URL. The page still opens at the resolved address.
- `$randomEmail` and `%randomEmail` become a generated address when a flow runs or when Pick loads a page. The saved field keeps the token. Settings → HTTP sets the domain, and `%randomEmail(other.at)` overrides it for that token.
- A long token field scrolls to the caret, including the last character. Selecting the whole value stays inside the field.

## [2.0.6] — 2026-10-07

### Fixed

- Sort and filter menus open from their button and stay inside the sidebar.
- Clicking outside a tree sidebar clears a select-all. A click on a row or an open menu keeps the selection.

## [2.0.5] — 2026-10-07

### Added

- Saved order on the collections sort menu. Dragging a row, or moving it with the keyboard, switches to Saved order so the arrangement stays. A request can sit above a folder.

### Changed

- Collection issues show on the row. An empty URL or an unresolved variable appears beside the request, and a folder shows how many issues it contains. Click the mark to open the list. The command palette offers Show collection issues only when something is wrong.
- Right-click the space left of a tree row, empty space, or the toolbar beside search, filter, and sort to create a folder or item. Collections, Database, Environments, service lists, flow templates, PlantUML, and the environment variable tree use this. The row stays unselected. Right-click the row itself still selects it and opens Open, Rename, and Delete.

## [2.0.4] — 2026-10-07

### Added

- Select variables or folders in an environment, then Ctrl+C and Ctrl+V to paste them into another environment. Keys stay the same, so `{{url}}` still works.
- HTML, XML, and SVG responses show a Preview tab that renders the page.

### Fixed

- The response More menu opens, so Raw, Cookies, and the other sections are reachable.
- A failed request no longer shows a failure count in the title bar.

## [2.0.3] — 2026-10-06

### Added

- Environment variable values highlight `{{names}}`. A name that does not exist is shown in red, with the key or folder path to use instead, and a line under the field shows what the value resolves to.

## [2.0.2] — 2026-10-06

### Added

- A variable inside an environment folder is used by its key, so `url` in folder `ms.folder` is `{{url}}`. `{{ms.folder.url}}` names that same variable when another `url` exists.
- An environment or folder variable value can reference another variable, such as `{{baseUrl}}/test`.

## [2.0.1] — 2026-10-06

### Added

- Ctrl+C copies a sidebar selection and Ctrl+V pastes it into the same list after a workspace switch. Collections, environments, database connections and queries, flows and the other service lists, PlantUML diagrams, and flow templates are included. A folder brings its children.

### Changed

- New workspaces start with no environments. Untouched first-run Local, Staging, Production, CI, Sandbox, and Preview catalogs are removed on load. An environment you renamed or filled in is kept. The Testing workspace still includes Local and Staging for the public demo URLs.

## [2.0.0] — 2026-10-05

### Added

- Settings onboarding wizard (abbreviated first-run path and full category walkthrough).
- Collab: connect a Git repository (https with a token, or SSH through the system Git binary) and its workspaces sync themselves after each save. One repository holds many workspaces: pick which to add to this PC, publish local workspaces into it, and connect several repositories at once. A right-side dock has a repository header and Overview, Workspaces, Activity, People, and Runs tabs. Secrets, history, cookies, and run logs stay on this PC.
- Collab daily path: the dock follows the open workspace, Update access token from Settings and the auth banner, review queue with richer previews, failing entry names on Runs, take-over from the dock, and People showing which workspace a teammate last reported.
- Workspace switcher groups workspaces under This PC and each connected repository; Settings → Collab lists repositories with per-repository pause, branch, access token, and disconnect.
- Repositories that held a single shared workspace are reorganized into the multi-workspace layout on first sync.
- Regression packs are claimed while they run, so only one person runs a pack at a time; results are published to the team, and a stale claim can be taken over.
- Expanded contributing and security policies, Code of Conduct, `NOTICE`, and `.env.example`.
- `npm run check:docs` — validates relative Markdown links in README and `docs/`.
- `npm run updater:local` — packs `Testrix-Setup.exe`, serves a GitHub-shaped local release feed, and lets an unpackaged `npm start` check that feed instead of GitHub.
- macOS disk images (`Testrix-mac-arm64.dmg`, `Testrix-mac-x64.dmg`) and Linux x64 packages (`Testrix-linux-x86_64.AppImage`, `Testrix-linux-amd64.deb`) on the GitHub release. In-app updates stay Windows-only.

### Changed

- Update actions say **Install** / **Install update** instead of Restart. The download is already on disk; the button starts Setup, which replaces the install and opens the new version.

- Workbench smoothness: save modes, dirty-tab awareness, HTTP in-flight cancel, and motion polish across panes and tabs.
- README and docs aligned with public GitHub readiness. Repo Markdown is README, CHANGELOG, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, plus `docs/development.md` and `docs/releasing.md`.
- Windows `Testrix-Setup.exe` stays unsigned (no paid Authenticode certificate). CI and Release share one quality workflow; Release publishes beta tags as GitHub pre-releases.
- `npm run test:all` runs verify, build, and Electron e2e. `npm run verify` now includes `check:docs`.
- Docker Compose and Playwright configs live with their files: `docker/compose.yml` and `e2e/playwright.config.ts`.

### Fixed

- Live flow, regression, load, mock, listener, intercept, and device progress updates every open workbench window.
- Production dependencies pass the high-severity audit: Angular 22.2.1, `basic-ftp` 6.2.2 for the mock server's FTP client, and `@graphql-tools/utils` 12.0.3 for the mock server's GraphQL helpers.
- Linux end-to-end tests open the workbench. Electron on Linux rejects a Windows `.ico` window icon, which aborted startup before any window existed.
- Settings schema no longer depends on a circular `database` ↔ `settings` import (that left `databasePrefsSchema` undefined in the renderer bundle).
- The in-app updater skips a GitHub Releases hit when it already checked within six hours, sends `If-None-Match`, and backs off on 429/403 instead of retrying.
- `npm run electron:pack` uses `apps/desktop` as the electron-builder project so workspace-root detection no longer looks for splash assets and `index.js` at the repo root. Pack pins Electron 44.3.0 for both the desktop payload and Setup shell, and skips the native rebuild when Visual Studio C++ tools are missing.
- Updater preview creates its profile folder before Electron starts and writes installer downloads to a resolved path, so a missing `user-data` hop no longer crashes the main process with `Testrix-Setup.exe.partial`.
- Settings clicks work again: opening a popup no longer stamps `-webkit-app-region` onto every node (that breaks hit-testing in Electron on Windows), and the first-run wizard no longer resets when settings are saved.
- Titlebar hints (including “ready to install”) stay inside the window instead of clipping off the right edge.
- Restart to update hands Setup the downloaded portable wrapper (`--payload-file`) so the appended app zip is found after electron-builder extracts the inner exe, shows Setup’s update window, and does not hide that process.
- Restart opens Setup’s **Updating Testrix** view instead of the first-run install form. Setup copies `app.asar` with unpatched `original-fs` (Electron’s asar hook was aborting the swap with `Invalid package`), and it removes the `%TEMP%/testrix-payload-*` extract folder when it is done.
- Windows Setup and Update remove leftover 1.x Squirrel installs (`%LOCALAPPDATA%\testrix`, `Update.exe`, the Start Menu folder) when moving to 2.x, and they replace an existing Testrix folder instead of overlaying files.
- Uninstall finishes after “Removing files…”, drops the Apps listing even when `.install-meta.json` is already gone, and no longer opens a looping `find` console window.

## [2.0.0-beta.1] — 2026-09-15

Greenfield shell: Angular 22 + Electron 44 monorepo, design tokens, Motion-ready UI kit, splash, workbench chrome, custom Setup app.
