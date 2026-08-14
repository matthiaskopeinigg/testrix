## Contributing to Testrix

Thanks for contributing. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

### Before you open a PR

1. Search existing issues/PRs for duplicates.
2. For bugs, include OS, Testrix version, and repro steps ([bug template](.github/ISSUE_TEMPLATE/bug_report.yml)).
3. Security issues: report privately via [SECURITY.md](SECURITY.md) — do not open a public issue.
4. Keep PRs focused; update [CHANGELOG.md](CHANGELOG.md) Unreleased when the change is user-facing.

### Stack expectations

- **Angular 21** standalone components, **`inject()`**, and signals where they simplify UI-local state.
- **SCSS** for all Angular component styling (`styleUrl`). There is **no Tailwind** layer in this repo.
- **Strict TypeScript** everywhere; schemas for disk + IPC payloads live under `shared/*` with **Zod** validation.

### Two different `shared/` trees

| Path | Alias | Purpose |
| --- | --- | --- |
| `shared/` | `@shared/*` | Contracts consumed by Electron + Angular (`config`, `errors`, HTTP, testing, …). |
| `src/app/shared/` | `@app/shared` | Renderer-only primitives (`tx-*`, pipes, directives). |

Avoid duplicating string unions between them without codegen.

### Shared UI kit layout

Each `tx-*` component keeps **one folder**. Folders are grouped by category under `src/app/shared/components/`:

| Category | Examples |
| --- | --- |
| `forms/` | `tx-input`, `tx-textarea`, `tx-toggle`, `tx-button`, `tx-form-field`, … |
| `chrome/` | `tx-sidebar`, `tx-tab-bar`, `tx-window-titlebar`, `tx-brand-logo`, split panes, … |
| `overlays/` | `tx-modal`, `tx-confirm-dialog`, `tx-settings-popup`, `tx-command-palette`, … |
| `feedback/` | `tx-banner`, `tx-spinner`, `tx-notification*`, `tx-error-banner`, … |
| `editors/` | `tx-code-editor`, `tx-variable-input`, `tx-response-viewer`, `tx-diff-view`, … |
| `data/` | `tx-tree`, `tx-key-value-list`, `tx-tags-input`, teams/author widgets, … |
| `_shared/` | Shared SCSS partials (for example `_tx-overlay-dialog.scss`) |

Prefer importing from the **`@app/shared`** barrel. If you deep-import, use the category path (for example `@app/shared/components/forms/tx-button/tx-button.component`).

### Styling conventions (`--tx-*`)

1. Global tokens reside in `src/styles/_tokens.scss` + `_themes.scss`.
2. `ConfigService.applyTheme()` maps `settings.appearance.theme` onto `body.theme-*`.
3. Component SCSS should compose from **`var(--tx-*)`** tokens.
4. Electron splash/error pages mirror palette values statically — update both when rebranding.

### Renderer UI primitives (selected)

| Selector | Responsibility |
| --- | --- |
| `tx-button` | Buttons + variants. Prefer `(pressed)` for host integrations. |
| `tx-modal` | Overlay/dialog baseline (backdrop dismiss + ESC). |
| `tx-form-field` | Label + control projection stack. |
| `tx-brand-logo` | Canonical brand `<img>` surfaces. |
| `tx-error-banner` | `ErrorNotificationService` payloads after Angular boot. |
| `[txAutofocus]` | Optional focus helper |

Barrel exports: `src/app/shared/index.ts`. Full widget guidance lives in the shared UI kit under `src/app/shared/`.

### Electron etiquette

1. Splash/error windows stay preload-free/static; main window preload is intentionally tiny.
2. IPC handlers orchestrate validation but delegate persistence to **`electron/services/**/*`**.
3. Always funnel IPC errors through **`wrapInvokeHandler`** for stable renderer messaging.
4. Path resolution crosses **dev**, **unpackaged**, and **packaged** builds — extend `electron/config/paths.ts`, not callers.

### Installer assets

| Platform | Customize via |
| --- | --- |
| Windows | `build/installer/windows/*.nsh` + regenerated BMP banners (`npm run sync:brand`). |
| Linux | `build/installer/linux/postinst.sh`, `prerm.sh`. |
| macOS helper | `build/uninstaller/macos/uninstall-testrix.command` |

### Sanity commands

```bash
npm run build
npm test
npm run test:electron
npm start
npm run dev
npm run start:dist
```

More detail: [docs/development.md](docs/development.md) and [docs/releasing.md](docs/releasing.md).
