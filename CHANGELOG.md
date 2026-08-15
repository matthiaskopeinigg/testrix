# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-beta.5] - 2026-08-15

### Added

- Database workspace: connections, folders, catalog browse, saved queries, and table data (filter, edit, export)
- Import and export of database connections and saved queries as a first-class bundle section
- Help wiki pages for the Database workspace
- DATABASE flow steps can write SQL or Redis inline, or select a saved query from the Database sidebar
- OAuth 2.0 with PKCE on collection and folder auth
- Local monitors that run a request, flow, or load test on a cron while Testrix is open
- Environment secret vault for sensitive variable values
- Development tools: certificate inspector, hash/bcrypt, JSONPath tester, and request diff
- Parse cURL into a request, and generate requests or mocks from Capture traffic
- Load-test result export as HTML, k6, or Gatling
- Docker Compose stack for local PostgreSQL and Redis
- Team sync secret scanning and conflict-file handling

### Changed

- Database connections live in the Database sidebar instead of Settings
- Flow step editor shows the type chip once (no repeated type headings)
- Split view moves the focused tab instead of cloning it; empty panes stay until closed

## [1.0.0-beta.4] - 2026-08-15

### Added

- Manual HTTP target for load tests (method, URL, headers, query, and body)
- Isolated load-test runs so each load test keeps its own live metrics

### Changed

- Load-test results panel stays collapsed until a run starts
- Manual load-test requests now send the configured body instead of an empty payload

## [1.0.0-beta.3] - 2026-08-14

### Fixed

- Installer pack on Linux, macOS, and Windows (`afterPack` hook must live inside `installer-shell/`)

## [1.0.0-beta.2] - 2026-08-14

### Fixed

- Electron main-process typecheck so the test gate and tagged release pack can run
- GitHub README brand mark (committed SVG path)
- Linux `npm ci` when optional `@emnapi/*` versions change

### Changed

- Patch and security dependency updates (Electron 42.9, sharp 0.35, GitHub Actions)

## [1.0.0-beta.1] - 2026-08-14

Initial public beta of Testrix: local-first desktop API client (HTTP, WebSocket, collections, environments, test suites, load tests, mocks, and capture).

[Unreleased]: https://github.com/matthiaskopeinigg/testrix/compare/v1.0.0-beta.5...HEAD
[1.0.0-beta.5]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.5
[1.0.0-beta.4]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.4
[1.0.0-beta.3]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.3
[1.0.0-beta.2]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.1
