# Development

## Prerequisites

- Node **20+** (`.nvmrc` → **22.12.0**)
- npm **11+** (`package.json` → `packageManager`)

```bash
npm install
```

## Public scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Brand sync + `ng serve` + Electron watch (`localhost:4720`) |
| `npm run dev` | Same as start with `TESTRIX_DEV=1` (DevTools, verbose logs) |
| `npm run start:dist` | Electron against an existing `dist/` build (no `ng serve`) |
| `npm run build` | Production Angular + Electron esbuild bundle |
| `npm run electron:bundle` | Bundle main/preload/splash Electron entries only |
| `npm run electron:pack` | Windows installer pipeline (local) |
| `npm test` | Vitest unit tests (non-watch) |
| `npm run test:interactive` | Vitest watch |
| `npm run test:electron` | `tsc -p tsconfig.electron.json --noEmit` |
| `npm run test:updater` | Silent-downgrade the installed app to the previous GitHub beta, then relaunch so Check for updates can offer the latest |
| `npm run sync:brand` | Sync SVG branding and generated icon/BMP assets |

Pack/release internals (`electron:build:*:payload|setup`, signing helpers) stay in `package.json` for CI; see [releasing.md](releasing.md).

## Environment flags

| Flag | Effect |
| --- | --- |
| `TESTRIX_DEV=1` | Set by `npm run dev` — detach DevTools, verbose main logs |
| `TESTRIX_SERVE_RENDERER=1` | Load renderer from `ng serve` |
| `TESTRIX_NO_SPLASH=1` | Skip splash window during boot |
| `TESTRIX_CONFIG_DIR` | Override the workspace JSON root. `npm start` / `npm run dev` default to `<repo>/.config` |

Workspace JSON for `npm start` / `npm run dev` lives in the repo **`.config/`** folder (`paths.json`, `profiles.json`, `settings.json`, and `profiles/<id>/…`). Chromium session files go under `.config/electron`. Packaged builds still use Electron userData (`%APPDATA%\testrix` on Windows). `.config/` is gitignored.

## Testing

- Renderer/shared unit tests: `npm test` (Angular Vitest + jsdom)
- Electron typecheck: `npm run test:electron`
- Real auto-update against GitHub betas: `npm run test:updater` (silent-downgrades to the previous published beta; `--list`, `--from v1.0.2-beta.4`, `--simulate-only`)
- CI runs the reusable [test-gate](../.github/workflows/test-gate.yml) workflow, then build smoke on Windows/macOS

## Conventions

Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for Angular, SCSS tokens, and shared UI placement.
