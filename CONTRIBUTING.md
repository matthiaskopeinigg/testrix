## Contributing to Testrix

### Stack expectations

- **Angular 21** standalone components, **`inject()`**, and signals where they simplify UI-local state.
- **SCSS** for all Angular component styling (`styleUrl`). There is **no Tailwind** layer checked into this repo.
- **Strict TypeScript** everywhere; schemas for disk + IPC payloads live under `shared/*` with **Zod** validation.

### Two different `shared/` trees

| Path | Alias | Purpose |
| --- | --- | --- |
| `shared/` | `@shared/*` | Contracts consumed by Electron + Angular (`config`, `errors`). |
| `src/app/shared/` | relative (`@app/shared/*`) | Renderer-only primitives (`tx-*`, pipes, directives). |

Avoid duplicating string unions between them without codegen.

### Styling conventions (`--tx-*`)

1. Global tokens reside in `src/styles/_tokens.scss` + `_themes.scss`.
2. `ConfigService.applyTheme()` maps `settings.appearance.theme` onto `body.theme-*`.
3. Component SCSS should compose from **`var(--tx-*)`** tokens (use `color-mix` sparingly against tokens, not unrelated hex blobs).
4. Electron splash/error pages mirror palette values statically — update both when rebranding.

### Renderer UI primitives

| Selector | Responsibility |
| --- | --- |
| `tx-button` | Buttons + variants (`cta`, `primary`, `secondary`, `add`). Prefer `(pressed)` output for host integrations. |
| `tx-modal` | Minimal overlay/dialog baseline (backdrop dismiss + ESC handling). |
| `tx-form-field` | Opinionated stack for demos (label + control projection). |
| `tx-brand-logo` | Canonical `<img src="/brand/logo.svg">` surfaces (synced SVG). Required in shell header. |
| `tx-error-banner` | Displays `ErrorNotificationService` payloads **after Angular boot**. Never reuse for preload-only faults. |
| `[txAutofocus]` | Optional focus helper |

Barrel exports: `src/app/shared/index.ts`.

### Electron etiquette

1. Splash/error windows stay preload-free/static; main window preload is intentionally tiny.
2. IPC handlers orchestrate validation but delegate persistence to **`electron/services/**/*`**.
3. Always funnel IPC errors through **`wrapInvokeHandler`** for stable renderer messaging.
4. Path resolution crosses **dev**, **unpackaged**, and **packaged** builds — extend `electron/config/paths.ts`, not callers.

### Installer assets

| Platform | Customize via |
| --- | --- |
| Windows (`nsis`) | `build/installer/windows/*.nsh` + regenerated BMP banners (`npm run sync:brand`). |
| Linux (`deb`) | `build/installer/linux/postinst.sh`, `build/installer/linux/prerm.sh`. |
| macOS helper | `build/uninstaller/macos/uninstall-testrix.command` |

### Sanity commands

```bash

npm run build

npm test

npm start          # ng serve + Electron (see scripts/serve-desktop.mjs — no `--devtools`)

npm run dev        # ng serve + Electron dev toolkit (`--devtools`)

npm run start:dist # Electron only against prior dist/ — no Angular server

npm run splash

npm run error:preview

```
