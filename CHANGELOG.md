# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

### Changed

- Update actions say **Install** / **Install update** instead of Restart. The download is already on disk; the button starts Setup, which replaces the install and opens the new version.

- Workbench smoothness: save modes, dirty-tab awareness, HTTP in-flight cancel, and motion polish across panes and tabs.
- README and docs aligned with public GitHub readiness. Repo Markdown is README, CHANGELOG, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, plus `docs/development.md` and `docs/releasing.md`.
- Windows `Testrix-Setup.exe` stays unsigned (no paid Authenticode certificate). CI and Release share one quality workflow; Release publishes beta tags as GitHub pre-releases.
- `npm run test:all` runs verify, build, and Electron e2e. `npm run verify` now includes `check:docs`.
- Docker Compose and Playwright configs live with their files: `docker/compose.yml` and `e2e/playwright.config.ts`.

### Fixed

- Live flow, regression, load, mock, listener, intercept, and device progress updates every open workbench window.
- Production dependencies pass the high-severity audit: Angular 22.2.1, and `basic-ftp` 6.2.2 for the mock server's FTP client.
- Linux end-to-end tests install the Electron binary before launch and use the X11 display, so the workbench window opens on the CI runner.
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
