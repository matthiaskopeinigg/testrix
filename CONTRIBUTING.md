# Contributing

Use conventional commits. Apps own entrypoints; packages own shared code.

- Renderer: Angular standalone components, SCSS, kebab-case files, `tx-` prefix.
- Do not import Electron from `apps/renderer` or `@testrix/ui`.
- UI kit lives in `packages/ui`, not `apps/renderer/src/app/shared`.
