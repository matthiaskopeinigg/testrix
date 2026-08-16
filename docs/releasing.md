# Releasing

## Version bump

1. Update `version` in root [`package.json`](../package.json) and [`installer-shell/package.json`](../installer-shell/package.json).
2. Refresh lockfiles (`npm install` in root; installer-shell as needed).
3. Update [CHANGELOG.md](../CHANGELOG.md) (move Unreleased notes into the new version).
4. Commit with a conventional message (for example `chore(release): v1.0.0-beta.2`).
5. Create an annotated tag `v*` matching the version and push the branch + tag:

```bash
git tag -a v1.0.0-beta.2 -m "v1.0.0-beta.2"
git push origin main
git push origin v1.0.0-beta.2
```

Pushing a `v*` tag runs [.github/workflows/release.yml](../.github/workflows/release.yml):

1. **Test gate** — unit tests + Electron typecheck
2. **Pack** Windows / Linux / macOS installers
3. **Publish** a GitHub Release with artifacts. Release notes are the matching
   `CHANGELOG.md` section for that version (not GitHub-generated commit lists).

Tags containing `-` (for example `beta`) are marked **prerelease**. Stable tags without a hyphen may require Windows code-signing secrets (`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`).

Retry a pack from the Actions UI with **workflow_dispatch** and the tag name (for example `v1.0.0-beta.1`). CI also supports **workflow_dispatch**.

## Dependabot

[.github/dependabot.yml](../.github/dependabot.yml) opens weekly grouped PRs for:

- Root npm (`angular`, `electron-builder`, `sigstore`, `dev-tooling` groups)
- `/installer-shell` npm
- GitHub Actions

### Triage policy

| Priority | Action |
| --- | --- |
| Security / high-impact transitive | Merge after CI green |
| Grouped Angular or electron-builder bumps | Merge as one PR; run `npm test` + `npm run build` locally if unsure |
| Risky majors (`diff` 8+, `esbuild` 0.28+, `sharp` 0.35+) | Review changelog; merge only if build/tests pass, otherwise close with a note |

Prefer merging the grouped Dependabot PR over stacking duplicate single-package PRs.

## Local pack

```bash
npm run electron:pack            # Windows prerelease-style pipeline
npm run electron:pack:release    # signed Windows path (requires cert env)
npm run electron:build:linux
npm run electron:build:mac
```
