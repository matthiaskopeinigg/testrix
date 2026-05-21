# Brand assets (`assets/brand`)

- Canonical vector mark: `logo.svg` (committed).
- Optional dark variant: `logo-dark.svg` (if absent, sync copies `logo.svg`).
- Raster icons and NSIS BMPs are generated during `npm run sync:brand` under `build/`.
- Electron static windows consume synced copies via `electron/splash/assets/logo.svg` and `electron/error/assets/logo.svg`.

The logo uses a conservative viewBox centered on dark UI backgrounds; tweak padding with the geometric paths as the product evolves.
