# Architecture

Testrix 2.0 splits the Electron host from the Angular renderer and keeps Setup as a third app.

```text
apps/desktop  →  packages/electron-core, packages/contracts
apps/renderer →  packages/ui, packages/motion, packages/contracts, packages/design-tokens
apps/setup    →  packages/electron-core, packages/contracts, packages/design-tokens
```

IPC is a narrow `window.testrix` bridge defined in `@testrix/contracts`. Persistence and HTTP engine packages are stubs so later features do not reshape the tree.

Boot: splash window (static HTML) → hidden main window → renderer `notifyReady` → splash fade → workbench.
