# Brand assets (`assets/brand`)

- Canonical vector mark: `logo.svg` (committed).
- README / social banner: `banner.svg`.
- Optional dark variant: `logo-dark.svg` (if absent, sync copies `logo.svg`).
- Raster icons (`icon.png`, `icon.ico`) are generated during `npm run sync:brand` under `assets/brand/`, `build/`, and each app’s `src/assets` for the Windows taskbar and packaged executables.
- Electron static windows consume synced copies via `apps/desktop/src/splash/assets/logo.svg`, `apps/desktop/src/error/assets/logo.svg`, and the renderer/setup copies.

The logo uses a conservative viewBox centered on dark UI backgrounds; tweak padding with the geometric paths as the product evolves.
