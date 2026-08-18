# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.2-beta.5]

### Changed

- HTTP Listener and HTTP Interceptor arm in the background and let later steps run; Validation or Cache wait for the first matching capture

## [1.1.2-beta.4]

### Changed

- Data & Config shows folder paths only (no per-file session.json / collections.json rows), with selectable text and a Copy button

### Fixed

- Request URL preview recognizes collection folder variables (`{{name}}` in a child request)
- Database sidebar tree rows match Collections and Environments size
- Data & Config “Choose workspace folder…” no longer shows a garbled ellipsis

## [1.1.2-beta.3]

### Fixed

- Importing a workspace bundle updates the sidebar and editors immediately (no restart)
- E2E Navigate to URL no longer fails when the page redirects (login SSO, SPA router)
- Adding a step under Retry / If / loops no longer duplicates it on each save
- Toggling All flows at once no longer blanks the regression Settings panel

## [1.1.2-beta.2]

### Added

- Regression results record retry attempts, show flaked vs failed counts, and treat recovered retries as passed unless Count flakes as failed is on
- A failed critical flow fails regression acceptance even when the pass rate meets the threshold
- Regression artifacts can sync linked flows from a Test Suite folder
- Regression results can export a self-contained HTML report
- A pinned golden run is stored on the regression artifact; Compare defaults to pinned vs latest
- Regression history charts pass rate and p95 duration across stored runs
- Test Suite Call graph shows TRIGGER edges between flows
- Test Suite IF / Else if / Else, FOR_EACH, WHILE, PARALLEL, and RETRY steps with Then/Else/Body lanes
- A Tree / Diagram view of flow steps (IF diamonds, wrapping rows, scroll zoom, live status)
- VALIDATION can continue on failure and still fail the flow at the end
- Run from this step / run to here on the step context menu
- Flow-level CSV/JSON datasets re-run a flow per row (including in Regression)
- Regression can reuse one E2E session sequentially and run a bootstrap flow first
- E2E SCREENSHOT checkpoints compare against a per-profile baseline PNG
- Capture can generate one Test Suite flow from selected traffic rows (REQUEST + VALIDATION pairs)

### Changed

- Add-step picker lists Common first (E2E, HTTP Request, Validation, Cache)
- Flow tabs split Overview (summary) from Settings (tags, critical, E2E, dataset)
- Skip unless sits under the step action and is collapsed by default
- History is pinned to the left-rail footer above Help
- Default left-rail order is Collections, Testing, Database, Environments, Development

## [1.1.2-beta.1]

### Added

- Flow run Step details can expand HTTP response headers
- Regression results open a flow’s step run log after the flow passes or fails
- `npm start` / `npm run dev` store profiles and settings in the repo `.config` directory
- Settings can reorder and hide left-rail sidebar items (Collections, Environments, Testing, Database, Development, History)

### Changed

- Run log step details open under the clicked step
- Regression runs keep E2E browsers hidden and close them after each flow (per-flow Show E2E is ignored)

### Fixed

- A REQUEST step in a later TRIGGER child substitutes `{{email}}` (and other CACHE aliases) in the URL instead of sending the template
- `npm start` / `npm run dev` keep workspace data across renderer reloads and Electron restarts
- A failed E2E step (missing selector, cancelled run) closes the runner window instead of leaving it stuck
- Turning off Show E2E keeps the runner window hidden while the flow runs
- An E2E click/type/hover cannot hang forever when Magenta (or another SPA) navigates mid-script; empty selectors fail immediately
- `npm start` / `npm run dev` restart Electron when E2E runner scripts change
- Disabled flow steps can be selected again so Enabled can be turned back on
- Run Flow stays available when a TRIGGER child already opened the E2E page

## [1.1.1]

### Changed

- Visible E2E windows can be moved during a run
- Test Suite Flow has a single Cancel control that stays clickable while a run is in progress

### Fixed

- E2E steps wait for the page to finish loading before they run, and retry guest scripts when Chromium navigates mid-evaluate
- A crashed E2E renderer no longer leaves the runner stuck; the next step opens a fresh window
- Regression E2E worker failures no longer abort the rest of the run or take down Testrix
- E2E HUD and macOS installer help use the Testrix name

## [1.1.0]

Stable channel build of the 1.1.0 beta series.

### Added

- Lookups in the Testing hub: ticket identifiers, skip-unless database queries, and a labeled results card
- Lookup result fields that contain JSON arrays or objects render as a table or list (for example a `products` array of `{ name, uuid }`)
- README feature map covering workspace, collections, environments, Database, testing tools, developer tools, Teams, settings, and desktop updates

### Changed

- Lookup skip-unless uses a JavaScript regex against a source value instead of a fixed kind dropdown
- Lookup playbooks use the full editor width and the same tab-open stagger as other workspace tabs
- Update checks only offer releases on the selected channel (Beta no longer offers a newer stable)
- Regression Cancel stays clickable while a run is in progress
- Parallel regression E2E flows each use their own browser window
- Regression dashboard lists in-flight flows, not only completed ones
- Deleted test-suite flows are unlinked from regressions and are not run
- Saving a Database connection shows a success toast

### Fixed

- Lookup tabs restore Run/Edit, inputs, and the last results card from the workspace session
- Enabling Required on a lookup step no longer breaks the editor
- Lookup results are selectable and have copy buttons
- Shared text fields keep the caret when Angular writes back the same value
- Duplicating a flow keeps original step names

### Removed

- Auto-seeded Customer ticket lookup playbook and Compose lookup demo tables

## [1.1.0-beta.2]

### Changed

- Update checks only offer releases on the selected channel (Beta no longer offers a newer stable)
- Regression Cancel stays clickable while a run is in progress
- Parallel regression E2E flows each use their own browser window
- Regression dashboard lists in-flight flows, not only completed ones
- Deleted test-suite flows are unlinked from regressions and are not run
- Saving a Database connection shows a success toast

### Fixed

- Shared text fields keep the caret when Angular writes back the same value

## [1.1.0-beta.1]

### Added

- Lookups in the Testing hub: ticket identifiers, skip-unless database queries, and a labeled results card
- Lookup result fields that contain JSON arrays or objects render as a table or list (for example a `products` array of `{ name, uuid }`)
- README feature map covering workspace, collections, environments, Database, testing tools, developer tools, Teams, settings, and desktop updates

### Changed

- Lookup skip-unless uses a JavaScript regex against a source value instead of a fixed kind dropdown
- Lookup playbooks use the full editor width and the same tab-open stagger as other workspace tabs

### Fixed

- Lookup tabs restore Run/Edit, inputs, and the last results card from the workspace session
- Enabling Required on a lookup step no longer breaks the editor
- Lookup results are selectable and have copy buttons

### Removed

- Auto-seeded Customer ticket lookup playbook and Compose lookup demo tables

## [1.0.9]

### Added

- The run log expands TRIGGER children so a nested flow failure shows the step that failed
- Sidebar trees keep empty space under the last row; right-click the panel title or toolbar padding for the same root menu
- Right-click a flow step to add a new step after it

### Fixed

- A flow triggered after a sibling (or later in a triggered folder) can use `{{variables}}` that earlier flow cached

## [1.0.8]

### Fixed

- RSA OAEP encrypt accepts a one-line public PEM and does not ask for a private-key password

## [1.0.7]

### Changed

- The packaged renderer stays local: UI fonts are no longer fetched from Google, and Chromium background networking is disabled so idle traffic is only the auto-updater talking to GitHub Releases
- Sidebar chrome, empty copy, and tree labels are not selectable (search and inline rename still are)

### Fixed

- Splash and installer windows no longer send debug snapshots to a local ingest endpoint

## [1.0.6]

### Changed

- The root flow’s Show E2E, Keep E2E, and environment apply to every TRIGGER child (a regression run also pins Show E2E)

### Added

- Validation can assert live page element text, HTML, or presence (optional CSS selector and pick-on-page)
- Assert element E2E action accepts optional expected text

## [1.0.5]

Stable channel build of 1.0.5-beta.1 (updater channel and SemVer fixes).

### Fixed

- A beta install can switch to Stable and auto-update to a published stable release
- SemVer treats `1.0.4` as newer than `1.0.3-beta.10` (same-core stables are newer than their betas)
- Release workflow starts when Authenticode secrets are unset (secret presence is checked via job env, not `if: secrets.*`)

## [1.0.5-beta.1]

### Fixed

- A beta install can switch to Stable and auto-update to a published stable release
- SemVer treats `1.0.4` as newer than `1.0.3-beta.10` (same-core stables are newer than their betas)
- Release workflow starts when Authenticode secrets are unset (secret presence is checked via job env, not `if: secrets.*`)

## [1.0.4]

First stable release of Testrix. This is the product as of the end of the `1.0.0`–`1.0.3` beta series: a local-first desktop API client (HTTP, WebSocket, collections, environments, test suites, load tests, mocks, and capture) with a Database workspace, team Git sync, and in-app updates.

### Added

- Collections, folders, and request workspaces with environments, dynamic variables, scripts, cookies, and code snippets
- HTTP and WebSocket clients
- Test suites (including E2E browser steps), regression runs, mock servers, traffic capture, and interceptors
- OAuth 2.0 with PKCE on collection and folder auth
- Environment secret vault for sensitive variable values
- Parse cURL into a request, and generate requests or mocks from Capture traffic
- Local monitors that run a request, flow, or load test on a cron while Testrix is open
- Load tests with a manual HTTP target, isolated per-test live metrics, and result export as HTML, k6, or Gatling
- Database workspace: connections, folders, catalog browse, saved queries, and table data (filter, edit, export)
- Database engines: PostgreSQL, Redis, Oracle, MariaDB, CockroachDB, ClickHouse, and MongoDB
- Import and export of database connections and saved queries as a first-class bundle section
- Named SQL parameters (`:name`) with a bind dialog before Run
- Team share of saved queries, plus a sanitized connection list (passwords stay local)
- Query connection picker as a folder tree, with per-query environment variables
- Ctrl+Enter execute chooser when several statements exist (run from caret vs run all)
- Confirm UPDATE/DELETE/DROP/TRUNCATE; block those on read-only queries
- Database sidebar engine logos and a schema picker (“N schemas selected”)
- Local Docker Compose stacks for PostgreSQL, Redis, and Oracle Free
- Settings → Database: close idle pooled connections after a chosen number of minutes (`0` keeps them open)
- Test Suite TRIGGER steps run another flow, or every descendant flow under a folder (fail-fast), inheriting variables and captures; the target picker is a searchable folder tree
- TRIGGER steps can reuse the E2E browser session so a later flow stays logged in
- Test Suite CACHE steps can generate values (for example `test-$uuid@gmail.com`) without a reference step, then reuse them as `{{email}}` in later steps
- RSA OAEP SHA-1 encrypt/decrypt Development Tool (Java `OAEPWithSHA-1AndMGF1Padding`) and Test Suite CACHE cipher option, with `{{placeholder}}` support in VALIDATION expected values
- Development tools: certificate inspector, hash/bcrypt, JSONPath tester, request diff, and RSA OAEP
- Team sync secret scanning and conflict-file handling
- In-app auto-update with Stable and Beta channels
- Help wiki pages for Database and the RSA OAEP tool

### Changed

- Database connections live in the Database sidebar (per workspace profile in `databases.json`); idle disconnect remains a global setting
- No schema is selected by default; pick schemas from the picker (DataGrip-style). Opening a connection no longer loads every schema up front
- SQL query editor shows gray inline suggestions for schemas, tables, and columns, ranked by context
- Query results toolbar matches the table data view (pager chips, filter, icon copy/export)
- Connection editor uses Save and Cancel; new connections stay unsaved until Save; Test connection never writes the profile
- Table data cells truncate long values; cell editors follow the column type
- Split view moves the focused tab instead of cloning it
- Prefix autocomplete (header names, query params, and similar fields) shows gray remainder text instead of a floating list; typing `$` still opens the dynamic-variable menu
- Test Suite Run log pretty-prints HTTP Request JSON responses
- Silent auto-update uses an in-app overlay until Setup is ready, then the app exits (no empty “Updating Testrix” window)
- Installer GitHub assets are named `Testrix-Setup` (hyphen)
- GitHub release notes come from the matching CHANGELOG.md section (without the version heading or date)
- GitHub Release titles use the tag (`v1.0.4`) instead of `Testrix v…`
- GitHub Actions attaches installers to a **draft** and does not publish
- Team Git sync pauses while a local workspace profile is active; local profiles are not auto-imported or pushed to the team repo
- Creating a team branch starts from `master` or `main` and keeps the current team profile files on the new branch

### Fixed

- RSA OAEP decrypt loads Java-style Base64-wrapped OpenSSL encrypted PKCS#1 PEMs (`BEGIN RSA PRIVATE KEY` / `Proc-Type: 4,ENCRYPTED`) and headerless PKCS#8 bodies, and accepts a Base64-encoded private-key password
- Oracle connections: Thick mode / Instant Client when needed, SID URLs, TNS `SERVICE_NAME` (DataGrip-style), JDBC URL paste, semicolon-terminated SQL, schema listing, and SELECT paging without an illegal `_tx_page` alias
- SQL autocomplete no longer freezes on databases with hundreds of schemas; suggestions stay capped and limited to selected schemas
- Pick on page for E2E CSS selectors attaches on the first open; Cancel pick aborts; the E2E window shows when a triggered flow has E2E steps
- Test Suite E2E Assert URL and Wait for URL use the expected URL from the step editor
- Test Suite manual REQUEST steps send the configured body and query params
- Reordering or nesting Test Suite sidebar flows and folders no longer drops nested items or wipes flow steps
- `{{placeholder}}` tokens from a TRIGGER’d flow highlight as known variables
- Switching workspace profiles reloads Test Suite, saved queries, and other profile-local testing data
- Selected schemas stay on a connection after collapse, reconnect, or a team pull that omitted the field
- Drag-reorder of database connections (for example PostgreSQL above Oracle) works instead of always dropping after
- Connection editor no longer clears username and password when you open the tab
- In-app updates pick the highest semver on the channel; a beta install no longer follows a stale Stable channel
- Windows silent installer extracts the payload in chunks and skips re-registering shortcuts on update
- Windows stable pack publishes an unsigned installer when Authenticode secrets are not configured, instead of failing the release

## [1.0.3]

Tagged in git. GitHub installers were not published (Authenticode secrets were missing).

## [1.0.3-beta.10]

### Fixed

- RSA OAEP decrypt loads Java-style Base64-wrapped OpenSSL encrypted PKCS#1 PEMs (`BEGIN RSA PRIVATE KEY` / `Proc-Type: 4,ENCRYPTED`) and accepts a Base64-encoded private-key password

## [1.0.3-beta.9]

### Fixed

- RSA OAEP decrypt accepts a headerless PKCS#8 private key body (Base64, URL-safe Base64, or hex) without BEGIN/END lines

## [1.0.3-beta.8]

### Added

- RSA OAEP SHA-1 encrypt/decrypt Development Tool (Java `OAEPWithSHA-1AndMGF1Padding`) and Test Suite CACHE cipher option, with `{{placeholder}}` support in VALIDATION expected values

## [1.0.3-beta.7]

### Fixed

- Pick on page no longer leaves a stuck E2E window when the CSS selector overlay fails to attach; Cancel pick aborts prep or picking

## [1.0.3-beta.6]

### Added

- Test Suite TRIGGER steps can reuse the E2E browser session so a later flow stays logged in

### Fixed

- Triggering a flow or folder that has E2E steps shows the E2E window when Show E2E is enabled

## [1.0.3-beta.5]

### Fixed

- Test Suite E2E Assert URL and Wait for URL use the expected URL from the step editor instead of an empty CSS selector

## [1.0.3-beta.4]

### Fixed

- Team Git sync pauses while a local workspace profile is active, and local profiles are no longer auto-imported or pushed to the team repo
- Creating a team branch starts from `master` or `main` and keeps the current team profile files on the new branch

## [1.0.3-beta.3]

### Changed

- Database connections are stored per workspace profile (`databases.json`) instead of in shared settings. Idle disconnect remains a global setting

### Fixed

- Pick on page for E2E CSS selectors attaches on the first open (late frames and a hidden runner no longer require picking twice)
- Test Suite `{{placeholder}}` tokens from a TRIGGER'd flow highlight as known variables, and clicking one opens the producing step (or the environment variable)
- Switching workspace profiles reloads Test Suite, saved queries, and other profile-local testing data instead of keeping the previous profile’s list

## [1.0.3-beta.2]

### Changed

- Test Suite Run log pretty-prints HTTP Request JSON responses instead of showing a single minified line

### Fixed

- Reordering or nesting Test Suite sidebar flows and folders no longer drops nested items or wipes flow steps

## [1.0.3-beta.1]

### Changed

- Silent auto-update no longer opens the Setup “Updating Testrix” window (it rendered as an empty gray box on some machines). The in-app overlay stays until Setup signals it is ready, then the app exits
- Prefix autocomplete (header names, query params, and similar fields) shows gray remainder text instead of a floating list. Typing `$` still opens the dynamic-variable menu

### Fixed

- Test Suite manual REQUEST steps send the configured body (and query params) instead of an empty body
- Header and query-param autocomplete no longer remounts the input after the first character

## [1.0.2-beta.9]

### Added

- Test Suite CACHE steps can generate values (for example `test-$uuid@gmail.com`) without a reference step, then reuse them as `{{email}}` in E2E and DATABASE/Redis steps

### Changed

- Test Suite, Regression, Load Test, Mock Server, Capture, Interceptor, and Monitors chrome no longer allows selecting labels and tree text (inputs, editors, and run/error output stay selectable)

## [1.0.2-beta.8]

### Fixed

- Unit tests compile again: the silent-update handshake helper no longer lives under `shared/` (Angular was typechecking Node `fs`)

## [1.0.2-beta.7]

### Added

- Test Suite TRIGGER steps run another flow, or every descendant flow under a folder (fail-fast), inheriting variables and captures
- TRIGGER target picker is a searchable folder tree (path shown on the closed control)
- Auto-update shows a Setup “Updating Testrix” window (progress) instead of a blank desktop after the app closes

### Changed

- Theme and layout setup overlay no longer allows selecting text
- In-app update overlay stays until Setup’s updating window is visible, then the app exits

### Fixed

- Update check on a beta install no longer follows a stale Stable channel (there is no GitHub “latest” stable release)
- `npm run test:updater` silent-downgrades to the previous published beta (GitHub builds ignore the simulated-version env var)

## [1.0.2-beta.6]

### Fixed

- Pick on page for E2E browser steps no longer fails with “Something went wrong” (`ipcMain` was missing in the picker session)

## [1.0.2-beta.5]

### Fixed

- Selected schemas stay on a connection after collapse, reconnect, or a team pull that omitted the field
- Dragging a later connection above an earlier one (for example PostgreSQL above Oracle) now reorders instead of always dropping after
- Connection editor no longer clears username and password when you open the tab; blank fields keep the stored secrets on Save and Test

## [1.0.2-beta.4]

### Fixed

- Electron typecheck for Oracle query column names (`v1.0.2-beta.3` failed the release test gate)

## [1.0.2-beta.3]

### Added

- Named SQL parameters (`:name`) with a bind dialog before Run
- Team share of saved queries, plus a sanitized connection list (passwords stay local)
- Query connection picker as a folder tree, with per-query environment variables
- Ctrl+Enter execute chooser when several statements exist (run from caret vs run all)
- Confirm UPDATE/DELETE/DROP/TRUNCATE; block those on read-only queries

### Changed

- Query results toolbar matches the table data view (pager chips, filter, icon copy/export)
- Existing connection editor uses Save and Cancel; Test connection never writes the profile
- Empty SELECT results show column headers instead of a blank message

### Fixed

- Connection picker hover and clicks no longer fall through to the SQL editor
- Execute chooser highlights the statement at the caret (including after `;`); Esc restores the caret
- Connection picker no longer shows expand chevrons on leaf connections

## [1.0.2-beta.2]

### Added

- Database sidebar shows official engine logos (single brand color) on each connection
- New connections stay unsaved until Save; Test connection does not persist; Cancel discards the draft

### Changed

- Connection context menu no longer includes Open data (still available on tables and views)

## [1.0.2-beta.1]

### Fixed

- GitHub Release publish stays draft until Windows, macOS, and Linux installers are attached (`v1.0.1-beta.9` went public without `Testrix-Setup.exe`)

## [1.0.1-beta.9]

### Added

- Local Oracle Free database in Docker Compose (`localhost:1521`, user `testrix`, service name `FREEPDB1`)
- Settings → Database: close idle pooled connections after a chosen number of minutes (`0` keeps them open)
- Database sidebar: “N Schemas selected” under a connection opens the schema picker

### Changed

- No schema is selected by default (Postgres `public` is no longer auto-added); pick schemas from the picker
- Schema picker list is denser for databases with many schemas
- GitHub release notes come from the matching CHANGELOG.md section

### Fixed

- In-app silent updates exit the running app more reliably so the installer can replace files
- Windows silent installer extracts the payload in chunks and skips re-registering shortcuts on update

## [1.0.1-beta.8]

### Changed

- Database query (and test-suite) connection dropdown shows folder path prefixes (`Prod/Primary (oracle)`) so identically named connections in different folders are distinguishable

## [1.0.1-beta.7]

### Fixed

- Oracle service-name connections match DataGrip JDBC more closely (TNS `SERVICE_NAME` instead of Easy Connect), with clearer ORA-12505 / ORA-12514 guidance and JDBC URL paste support

## [1.0.1-beta.6]

### Fixed

- SQL query autocomplete no longer freezes the app: broke a catalog prefetch → revision → ghost refresh loop, debounced schema loads, and capped tables/columns fed into suggestions

## [1.0.1-beta.5]

### Fixed

- SQL `FROM` / `JOIN` autocomplete no longer freezes on Oracle (and similar) databases with hundreds of schemas — bare `FROM` no longer dumps every schema name; suggestions stay capped and prefix-filtered

## [1.0.1-beta.4]

### Fixed

- Schema picker: clearer space between the action buttons and the schema list
- SQL schema / table autocomplete no longer freezes after opening Schemas… on databases with hundreds of schemas (suggestions stay limited to selected schemas)

## [1.0.1-beta.3]

### Fixed

- Oracle SELECT paging no longer uses an `_tx_page` alias (leading `_` is ORA-00911)

### Changed

- Database sidebar shows only selected schemas (DataGrip-style): defaults to the current user / public schema, with Schemas… search to add more
- Opening a connection no longer loads every schema up front (avoids freezes on databases with hundreds of schemas); the full list loads only when you open Schemas…
- SQL query editor shows gray inline suggestions (like the WHERE filter) for schemas, tables, and columns, ranked by context (FROM, `schema.`, `table.`)

## [1.0.1-beta.2]

### Fixed

- Oracle queries no longer fail with ORA-00911 when SQL ends with a semicolon
- Oracle schemas and tables appear in the sidebar (uppercase driver column aliases are mapped correctly)

## [1.0.1-beta.1]

### Fixed

- Oracle connections that work in DataGrip but fail in Thin mode with password verifier 0x939: load Instant Client (Thick mode) when it is on PATH or set on the connection, and support SID URLs
- In-app updates pick the highest semver beta instead of GitHub's list order

## [1.0.0-beta.9]

### Added

- Database connections for Oracle, MariaDB, CockroachDB, ClickHouse, and MongoDB

## [1.0.0-beta.8]

### Changed

- Table data cells truncate long values to a fixed max width (full text on hover)
- Cell editors follow the column type: booleans are true/false only, integers accept digits, decimals accept one point, and json must parse

## [1.0.0-beta.7]

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

## [1.0.0-beta.6]

### Changed

- Installer GitHub assets are named `Testrix-Setup` (hyphen) so GitHub does not rewrite spaces to dots

### Fixed

- Certificate inspector SHA-256 fingerprint in unit tests (Node Web Crypto)

## [1.0.0-beta.5]

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

## [1.0.0-beta.4]

### Added

- Manual HTTP target for load tests (method, URL, headers, query, and body)
- Isolated load-test runs so each load test keeps its own live metrics

### Changed

- Load-test results panel stays collapsed until a run starts
- Manual load-test requests now send the configured body instead of an empty payload

## [1.0.0-beta.3]

### Fixed

- Installer pack on Linux, macOS, and Windows (`afterPack` hook must live inside `installer-shell/`)

## [1.0.0-beta.2]

### Fixed

- Electron main-process typecheck so the test gate and tagged release pack can run
- GitHub README brand mark (committed SVG path)
- Linux `npm ci` when optional `@emnapi/*` versions change

### Changed

- Patch and security dependency updates (Electron 42.9, sharp 0.35, GitHub Actions)

## [1.0.0-beta.1]

Initial public beta of Testrix: local-first desktop API client (HTTP, WebSocket, collections, environments, test suites, load tests, mocks, and capture).

[Unreleased]: https://github.com/matthiaskopeinigg/testrix/compare/v1.1.2-beta.5...HEAD
[1.1.2-beta.5]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.2-beta.5
[1.1.2-beta.4]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.2-beta.4
[1.1.2-beta.3]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.2-beta.3
[1.1.2-beta.2]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.2-beta.2
[1.1.2-beta.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.2-beta.1
[1.1.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.1
[1.1.0]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.0
[1.1.0-beta.2]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.0-beta.2
[1.1.0-beta.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.1.0-beta.1
[1.0.9]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.9
[1.0.8]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.8
[1.0.7]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.7
[1.0.6]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.6
[1.0.5]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.5
[1.0.5-beta.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.5-beta.1
[1.0.4]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.4
[1.0.3]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3
[1.0.3-beta.10]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.10
[1.0.3-beta.9]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.9
[1.0.3-beta.8]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.8
[1.0.3-beta.7]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.7
[1.0.3-beta.6]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.6
[1.0.3-beta.5]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.5
[1.0.3-beta.4]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.4
[1.0.3-beta.3]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.3
[1.0.3-beta.2]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.2
[1.0.3-beta.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.3-beta.1
[1.0.2-beta.9]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.9
[1.0.2-beta.8]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.8
[1.0.2-beta.7]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.7
[1.0.2-beta.6]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.6
[1.0.2-beta.5]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.5
[1.0.2-beta.4]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.4
[1.0.2-beta.3]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.3
[1.0.2-beta.2]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.2
[1.0.2-beta.1]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.2-beta.1
[1.0.1-beta.9]: https://github.com/matthiaskopeinigg/testrix/releases/tag/v1.0.1-beta.9
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
