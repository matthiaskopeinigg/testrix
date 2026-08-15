# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1-beta.8] - 2026-08-15

### Changed

- Database query (and test-suite) connection dropdown shows folder path prefixes (`Prod/Primary (oracle)`) so identically named connections in different folders are distinguishable

## [1.0.1-beta.7] - 2026-08-15

### Fixed

- Oracle service-name connections match DataGrip JDBC more closely (TNS `SERVICE_NAME` instead of Easy Connect), with clearer ORA-12505 / ORA-12514 guidance and JDBC URL paste support

## [1.0.1-beta.6] - 2026-08-15

### Fixed

- SQL query autocomplete no longer freezes the app: broke a catalog prefetch → revision → ghost refresh loop, debounced schema loads, and capped tables/columns fed into suggestions

## [1.0.1-beta.5] - 2026-08-15

### Fixed

- SQL `FROM` / `JOIN` autocomplete no longer freezes on Oracle (and similar) databases with hundreds of schemas — bare `FROM` no longer dumps every schema name; suggestions stay capped and prefix-filtered

## [1.0.1-beta.4] - 2026-08-15

### Fixed

- Schema picker: clearer space between the action buttons and the schema list
- SQL schema / table autocomplete no longer freezes after opening Schemas… on databases with hundreds of schemas (suggestions stay limited to selected schemas)

## [1.0.1-beta.3] - 2026-08-15

### Fixed

- Oracle SELECT paging no longer uses an `_tx_page` alias (leading `_` is ORA-00911)

### Changed

- Database sidebar shows only selected schemas (DataGrip-style): defaults to the current user / public schema, with Schemas… search to add more
- Opening a connection no longer loads every schema up front (avoids freezes on databases with hundreds of schemas); the full list loads only when you open Schemas…
- SQL query editor shows gray inline suggestions (like the WHERE filter) for schemas, tables, and columns, ranked by context (FROM, `schema.`, `table.`)

## [1.0.1-beta.2] - 2026-08-15

### Fixed

- Oracle queries no longer fail with ORA-00911 when SQL ends with a semicolon
- Oracle schemas and tables appear in the sidebar (uppercase driver column aliases are mapped correctly)

## [1.0.1-beta.1] - 2026-08-15

### Fixed

- Oracle connections that work in DataGrip but fail in Thin mode with password verifier 0x939: load Instant Client (Thick mode) when it is on PATH or set on the connection, and support SID URLs
- In-app updates pick the highest semver beta instead of GitHub's list order

## [1.0.0-beta.9] - 2026-08-15

### Added

- Database connections for Oracle, MariaDB, CockroachDB, ClickHouse, and MongoDB

## [1.0.0-beta.8] - 2026-08-15

### Changed

- Table data cells truncate long values to a fixed max width (full text on hover)
- Cell editors follow the column type: booleans are true/false only, integers accept digits, decimals accept one point, and json must parse

## [1.0.0-beta.7] - 2026-08-15

### Changed

- Database sidebar: click a connection to expand its catalog; Connection settings is on the context menu
- Click a table or view to open data; Table information / View information expands structure
- Compact connection tree rows and a tighter table-data toolbar with a full-width WHERE row
- WHERE column suggestions complete inline (ghost remainder) instead of a popup
- Local Postgres seed includes larger sample tables (`actors`, `films`, `customer_profiles`)

### Fixed

- Database sidebar stuttering while catalogs and table details load
- WHERE field losing focus after Enter
- Typed WHERE text turning gray while a suggestion remainder is shown
- Table data grid clipping horizontal scroll

## [1.0.0-beta.6] - 2026-08-15

### Changed

- Installer GitHub assets are named `Testrix-Setup` (hyphen) so GitHub does not rewrite spaces to dots

### Fixed

- Certificate inspector SHA-256 fingerprint in unit tests (Node Web Crypto)

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

[Unreleased]: https://github.com/matthiaskopeinigg/testrix/compare/v1.0.1-beta.8...HEAD
[1.0.1-beta.8]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.8
[1.0.1-beta.7]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.7
[1.0.1-beta.6]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.6
[1.0.1-beta.5]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.5
[1.0.1-beta.4]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.4
[1.0.1-beta.3]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.3
[1.0.1-beta.2]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.2
[1.0.1-beta.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.1
[1.0.0-beta.9]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.9
[1.0.0-beta.8]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.8
[1.0.0-beta.7]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.7
[1.0.0-beta.6]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.6
[1.0.0-beta.5]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.5
[1.0.0-beta.4]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.4
[1.0.0-beta.3]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.3
[1.0.0-beta.2]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.0-beta.1
