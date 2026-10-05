# Contributing

Thank you for helping improve Testrix. The project is a TypeScript monorepo: Electron main in `apps/desktop`, Angular workbench in `apps/renderer`, shared packages under `packages/*`, and installer UI in `apps/setup`.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Setup

1. Install [Node.js](https://nodejs.org/) matching `engines` in the root `package.json` (see `.nvmrc` for the version CI uses).
2. Clone the repository and install dependencies:

```bash
npm install
```

3. Start the desktop app in development mode:

```bash
npm run dev
```

Optional: local test databases via Docker — see [docs/development.md](docs/development.md).

## Project conventions

- **Conventional commits** — use types such as `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. Example: `feat(collections): add folder docs preview`.
- **Apps own entrypoints**; **packages own shared code**.
- **Renderer:** Angular standalone components, SCSS (no Tailwind in the renderer), kebab-case filenames, `tx-` prefix for app components.
- **UI kit** lives in `packages/ui`, not `apps/renderer/src/app/shared`.
- **Security:** do not import Electron or Node APIs from `apps/renderer` or `@testrix/ui`. IPC goes through `@testrix/contracts` and the preload bridge.
- **Tooltips:** use `tx-hint` from `@testrix/ui`; avoid native `title` tooltips.

### Repo root

Keep the repository root to **config and entry docs**. Put new scripts in `tooling/scripts/` and extra documentation in `docs/`.

Stay at the root: `package.json`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `NOTICE`, `LICENSE`, lint/format/test/tsconfig files, `.env.example`, and the folders `apps/`, `packages/`, `docs/`, `e2e/`, `tooling/`, `assets/`, `docker/`, `.github/`. Compose lives in `docker/compose.yml`. Playwright config lives in `e2e/playwright.config.ts`. Product help stays in the app (F1). Repo how-to is `docs/development.md` and `docs/releasing.md` only.

### Test file names

- `*.spec.ts` — Vitest unit, store, or helper tests.
- `*.journey.spec.ts` — Vitest multi-step feature logic (not Playwright).
- `*.component.test.ts` — Angular TestBed only (`templateUrl` compiles as in the app).
- `e2e/*.e2e.ts` — Playwright against the built Electron app (`e2e/playwright.config.ts`).
- `*.coverage.spec.ts` — Help-registry copy checks (leave these as-is).

## Tests and checks

```bash
npm run verify          # lint + lint:styles + format:check + typecheck + test:coverage + test:components + check:docs
npm run test:all        # verify + build + Playwright e2e
npm run lint            # ESLint (type-aware TS rules, Angular templates, tx-hint rule)
npm run lint:styles     # Stylelint for SCSS
npm run format:check    # Prettier for config, workflow, and tooling files
npm run typecheck       # tsc for desktop, setup, renderer (app + specs), and package sources
npm test                # Vitest unit and integration specs (*.spec.ts)
npm run test:coverage   # The same specs with per-package coverage floors from vitest.config.mts
npm run test:components # Angular TestBed component tests (*.component.test.ts) through ng test
npm run build           # Renderer build + Electron bundle
npm run test:e2e        # Playwright drives the built Electron app (run npm run build first)
npm run check:docs      # Verify relative Markdown links
npm run updater:local   # Pack + local GitHub-shaped update feed; then npm start and Settings → Updates
```

How the runners map to those names:

- `*.spec.ts` and `*.journey.spec.ts` run in Vitest (Node, or jsdom with `// @vitest-environment jsdom`). Stores use `createStoreHarness` from `apps/renderer/src/testing/store-harness.ts` with a fake desktop API.
- `*.component.test.ts` runs through the Angular unit-test builder, so `templateUrl` components compile as in the app.
- `e2e/*.e2e.ts` launches the real app with an isolated profile via `TESTRIX_USER_DATA_DIR`.
- Coverage floors only go up. When a change raises coverage, raise the matching floor in `vitest.config.mts`.

CI runs on pull requests and pushes to the default branches:

| Job | Runner | Steps |
| --- | --- | --- |
| Quality (reusable) | Ubuntu | lint, lint:styles, format:check, typecheck, test:coverage, test:components, check:docs, build, `npm audit --omit=dev --audit-level=high`, then Electron e2e under `xvfb` |
| Windows package smoke | Windows | after Quality: unsigned `npm run electron:pack`, confirms Authenticode status is `NotSigned`, uploads the installer |

Pushing a `v*` tag (or running Release with a tag) publishes an **unsigned** Windows installer and Ed25519-signed update manifests. There is no paid Authenticode certificate. See [docs/releasing.md](docs/releasing.md).

## Pull request checklist

- [ ] Changes match existing patterns in the touched area (naming, SCSS, signals, IPC).
- [ ] `npm run verify` passes locally (or explain why a check is not applicable). Run `npm run test:all` when the change is user-visible.
- [ ] User-visible behavior is documented in in-app Help when appropriate, or in `docs/` for repo-level topics.
- [ ] `npm run check:docs` passes if you edited `README.md` or files under `docs/`.
- [ ] No secrets, tokens, or personal paths committed.
- [ ] Commit messages follow conventional commits; PR description explains **why**, not only **what**.

## Questions

Open a GitHub Issue for bugs and ideas. Product details are in-app Help (F1). For security issues, follow [SECURITY.md](SECURITY.md).
