<p align="center">
  <img src="assets/brand/logo.svg" alt="Testrix" width="160" />
</p>

# Testrix

[![CI](https://github.com/matthiaskopeinigg/testrix/actions/workflows/ci.yml/badge.svg)](https://github.com/matthiaskopeinigg/testrix/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/matthiaskopeinigg/testrix)](https://github.com/matthiaskopeinigg/testrix/releases/latest)

Local-first desktop API workbench built with **Angular 21** and **Electron**. Collections, environments, HTTP and WebSocket clients, a Database workbench, test automation, load and regression testing, mocks, capture, interceptors, Git-backed team sync, and developer tools — all on your machine. No Testrix cloud account.

In-app Help (sidebar footer) is the full product guide. This README is the public feature map plus install and develop notes.

## Features

### Workspace

- Profile-isolated data: switch profiles from the title bar; each profile has its own collections, environments, testing artifacts, Database connections, session, and history
- Shared `settings.json` for appearance, HTTP defaults, logging, Database idle disconnect, and keyboard bindings
- Tabbed editors with pin, reorder, split panes, and Ctrl+Tab / Ctrl+Shift+Tab cycling
- Per-tab-type editor layout (sidebar section list vs tabs under the editor bar)
- Welcome screen shortcuts when no tabs are open
- Command palette (Ctrl+K / Cmd+K) for commands and quick-open of workspace items
- Import / export of workspace data from Settings → Data & Config

### Collections

- Hierarchical folders, HTTP requests, and WebSocket entries with search, filter, sort, tags, and context menus
- HTTP client: method, URL, query params, headers, body (JSON, XML, raw, form-data, binary, GraphQL), docs, and per-request HTTP overrides
- Paste cURL into the URL bar (or Import cURL from the palette) to fill method, URL, headers, and body
- Preview the fully resolved request; generate client snippets (including Java, Kotlin, PHP, Ruby, and PowerShell)
- Auth: API keys, Basic, Bearer, and OAuth 2.0 (authorization code with PKCE, client credentials, password). Tokens stay in the local vault and refresh on send
- Cookie jar per profile (title bar); optional per-request cookie sending and HTTP/2
- Pre-request and post-response scripts with a Postman-compatible `pm` API
- `{{variables}}` from the active environment; `$` dynamic placeholders (`$uuid`, `$timestamp`, `$randomInt`, …) resolved at send time
- WebSocket client with connect, send, and message log
- Folder-level defaults and click behavior (open vs expand) from Settings → Collections

### Environments

- Named variable sets with nested scopes, activate from the sidebar or an environment tab
- Secret values stored in the local encrypted vault (`vault.bin`), not in `environments.json`
- `{{variableName}}` resolution in URLs, bodies, scripts, Database queries, and test steps

### Database

- Saved connections: PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, SQLite, CockroachDB, ClickHouse, MongoDB, and Redis
- Catalog browser (schemas, tables, views, collections), schema selection, test connection, connect-on-boot
- Saved SQL / Redis / MongoDB queries with run-from-cursor or run-all
- Table data tabs from a table or view
- Local Docker Compose stack in this repo for PostgreSQL, MySQL, Oracle, and Redis (`docker compose up -d`)

### Testing

- **Test Suite** — folders and flows; step tree with REQUEST, VALIDATION, CACHE, DATABASE, E2E (browser pick-on-page), HTTP_LISTENER, HTTP_INTERCEPTOR, WAIT, MANUAL, and TRIGGER (nested flows, inherited variables, optional shared E2E session)
- **Load Test** — collection or manual targets, concurrency/duration profiles, latency and throughput metrics, run compare, HTML / k6 / Gatling export
- **Regression** — saved runs across flows or captures with step-level diffs
- **Mock Server** — local HTTP stubs with matchers, delay, CORS, hit history, auto-start
- **Capture** — embedded browser traffic log; generate a collection folder, OpenAPI spec, or mock endpoints
- **Interceptor** — proxy, block, or mock outbound HTTP by URL rule
- **Monitors** — local cron while the app is open (request, flow, or load test); desktop notifications on failure
- **Lookups** — playbooks that take ticket inputs, run sequential Database queries (skip-unless regex, extracts, required steps), and show a labeled results card (tables for JSON arrays)

### Development tools

UUID / ULID / NanoID generator, syntax-aware code editor, Base64, JWT toolkit (generate / decode / validate), cron builder, regex tester, URL encode/decode/parse, bcrypt, OpenAPI editor, Hash / HMAC, JSONPath tester, certificate inspector, RSA OAEP cipher (Java-compatible SHA-1), and request/response diff.

### History, Help, and Teams

- **History** — sent HTTP log with filters; reopen or re-send from a history tab
- **Help** — in-app wiki covering every area above
- **Teams** — Git-backed sync with no Testrix cloud. Connect a remote, import or publish team profiles, branches, per-file conflict resolution (including entity merge for collections and environments). Secrets, session, history, cookies, monitors, and lookups stay local. Staged JSON is scanned for private keys before push

### Settings

Appearance (themes, fonts, motion), UI chrome, rebindable app shortcuts, per-area editor layout, HTTP defaults (timeouts, retries, default headers, client certificates, DNS overrides, proxy), logging, Database idle disconnect, Data & Config (profiles, paths, export), and About.

### Desktop

- Local-first config root (not inside the installer path): Windows/macOS `Documents/Testrix`, Linux `$XDG_CONFIG_HOME/testrix` or `~/.config/testrix`
- In-app updates from GitHub Releases (Stable and Beta channels)

## Install

Download the latest installer from [GitHub Releases](https://github.com/matthiaskopeinigg/testrix/releases):

| OS | Artifact |
| --- | --- |
| Windows | `Testrix-Setup.exe` |
| macOS | `Testrix-Setup.dmg` |
| Linux | `Testrix-Setup.AppImage` |

Prerelease tags (for example `v1.1.0-beta.1`) publish unsigned Windows builds. Stable tags (`vX.Y.Z` without a hyphen) sign the Windows installer when `WIN_CSC_LINK` is configured; otherwise they ship unsigned as well.

## Develop

**Prerequisites:** Node **20+** (`.nvmrc` pins **22.12.0**), npm **11+**.

```bash
npm install
npm start          # Angular + Electron (splash on; no auto DevTools)
npm run dev        # same + TESTRIX_DEV=1 (DevTools, verbose logs)
npm test           # Vitest unit tests
npm run build      # production Angular + Electron bundle
```

Disable splash for faster Electron boot iterations:

```powershell
$env:TESTRIX_NO_SPLASH='1'; npm run dev
```

See [docs/development.md](docs/development.md) for the full script surface and flags.

## Config vs binaries

Installers place binaries where the OS expects. Runtime JSON (`settings.json`, `session.json`) lives under an **anchor-derived config directory**, not inside the installer path:

| OS | Default config root |
| --- | --- |
| Windows | `%USERPROFILE%\Documents\Testrix` |
| macOS | `~/Documents/Testrix` |
| Linux | `$XDG_CONFIG_HOME/testrix` or `~/.config/testrix` |

## Documentation

- [docs/](docs/README.md) — architecture, development, releasing, security
- [CONTRIBUTING.md](CONTRIBUTING.md) — coding standards and PR workflow
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [CHANGELOG.md](CHANGELOG.md) — release notes
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards

## License

[MIT](LICENSE)
