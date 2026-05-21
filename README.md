## Testrix

Local-first scaffold pairing **Angular 21**, **Electron 42**, SVG branding sync, splash boot sequencing, strict TypeScript (`shared/config` + `shared/errors`), and **electron-builder** targets for Windows (NSIS), macOS (stock DMG), and Linux (`deb` + AppImage hooks).

### Prerequisites

- Node **20+** (`.nvmrc` pins **`22.12.0`**)
- npm **11+** (`package.json` → `packageManager`)

### Setup

```bash
npm install
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | `sync:brand` + `ng serve` + Electron esbuild `--watch` + Electron loading `localhost:4720` (default splash; no auto DevTools) |
| `npm run dev` | Same as **`npm start`**, plus Electron **dev toolkit** (`TESTRIX_DEV=1`: auto-detach DevTools, verbose logging) |
| `npm run start:dist` | Runs Electron against a **prior** production build in `dist/` (fails fast if Angular/Electron bundles are missing; no Angular dev server) |
| `npm run splash` | Splash window only (`dist/electron/splash-only.main.js`) |
| `npm run error:preview` | Static Electron **error** page (`electron/error/error.html`). Words after `--` become the body text; launcher sets **`TESTRIX_ERROR_PREVIEW_MESSAGE`** for the Electron process |
| `npm run sync:brand` | Copies canonical SVG branding + emits ICO/BMP assets |
| `npm run build` | `sync:brand` → production `ng build` → esbuild Electron bundles |
| `npm run electron:bundle` | esbuild outputs `dist/electron/main.js`, `preload/main.preload.js`, `splash-only.main.js` |
| `npm run electron:pack` | `npm run build` + `electron-builder -c electron-builder.yml` |

Disable splash locally (Electron boot iterations only):

```powershell
$env:TESTRIX_NO_SPLASH='1'; npm run dev

```

### Config vs binaries

Installers lay down binaries/resources wherever the OS-specific flow dictates. Runtime JSON (`settings.json`, `session.json`) lives under an **anchor-derived config directory**, never inside the installer path. Defaults:

| OS | Default config root |
| --- | --- |
| Windows | `%USERPROFILE%\Documents\Testrix` |
| macOS | `~/Documents/Testrix` |
| Linux | `$XDG_CONFIG_HOME/testrix` or `~/.config/testrix` |

### Renderer bridge

Preload publishes `window.testrix` (`notifyReady`, `config.*`, version metadata). Browser-only dev (`ng serve` without Electron) intentionally lacks the bridge — `ConfigService` falls back to Zod defaults for UI previews.

### Security / CSP / single-instance

- `sandbox` + `contextIsolation` for BrowserWindows; static splash/error pages stay preload-free.
- `session.defaultSession.webRequest` sets CSP — dev mode permits the configured dev origin (default `localhost:4720`) + WS; production is stricter (`script-src 'self'` with limited `'unsafe-inline'` parity for Angular bundles).
- `app.requestSingleInstanceLock()` avoids double boots and raises thefirst window.

### Logs

Main-process logging writes beside Electron `userData` (`electron/errors/logger.ts`).

### Tests & CI

- `npm test` → Angular Vitest runner in Node/jsdom (no `--browsers` needed).
- `.github/workflows/ci.yml` mirrors plan §11b: Ubuntu build+test, Win/macOS build smoke.
