# Releasing

Releases are built and published by [`.github/workflows/release.yml`](../.github/workflows/release.yml) when a `v*` tag is pushed, or when you run the workflow by hand with that tag. Quality (lint, typecheck, Vitest, Angular component tests, doc links, build, e2e) runs first. The in-app updater then reads the Ed25519-signed manifests that workflow publishes.

Windows installers are **not Authenticode-signed**. There is no paid code-signing certificate.

## Channels

| Tag                            | Channel | GitHub release |
| ------------------------------ | ------- | -------------- |
| `v2.1.0`                       | Stable  | Latest         |
| `v2.1.0-beta.1`, `v2.1.0-rc.1` | Beta    | Pre-release    |

A stable release also replaces `beta.json` when it is newer than the current beta, so beta users always move forward.

## Two kinds of signing

| What | Used? | Cost |
| --- | --- | --- |
| Windows Authenticode (`Testrix.exe` publisher) | **No** | Paid certificate |
| Ed25519 update manifest (`beta.json` / `stable.json`) | **Yes** | Free, generated locally |

Pack sets `CSC_IDENTITY_AUTO_DISCOVERY=false` and electron-builder `forceCodeSigning: false`. CI checks that the built installer’s Authenticode status is `NotSigned`. SmartScreen may warn on first run; that is expected. See [NOTICE](../NOTICE).

The app still only installs an update whose manifest verifies against the public key it ships, and whose SHA-512 matches the downloaded file.

GitHub rate-limits unauthenticated `releases/download` traffic. The updater stores the last check (and an ETag) under the updates folder, skips a scheduled hit for six hours, sends `If-None-Match`, and backs off on 429/403 using `Retry-After`. Check now still asks GitHub unless a backoff is active.

## One-time setup: the update key

1. Run `npm run updater:keygen`. It writes the public key into `packages/contracts/src/update.ts` (`UPDATE_PUBLIC_KEY`) and the private key to `.secrets/update-signing-key.pem`, which git ignores.
2. Add the private key file's full contents as the `UPDATE_SIGNING_KEY` repository secret under **Settings > Secrets and variables > Actions**.
3. Keep an offline backup of the private key, then delete `.secrets/update-signing-key.pem`.
4. Commit the updated `update.ts`.

Rotating the key (`npm run updater:keygen -- --force`) means installed builds reject every manifest signed with the new key. Only rotate when the old key is compromised, and ship a release signed with the old key first that carries the new public key.

## Cutting a beta

1. Put release notes under `## [Unreleased]` in `CHANGELOG.md`.
2. Bump every package and date the changelog section:

   ```bash
   npm run release:bump -- 2.0.0-beta.2
   npm install --package-lock-only
   ```

3. Commit, tag, and push:

   ```bash
   git commit -am "chore(release): 2.0.0-beta.2"
   git tag v2.0.0-beta.2
   git push origin HEAD v2.0.0-beta.2
   ```

A hyphen in the version (`-beta.`, `-rc.`) makes the GitHub release a **pre-release**. You can also run **Actions → Release → Run workflow** and pass the existing tag.

The workflow runs the same Quality jobs as CI, then packs three installers: unsigned Windows `Testrix.exe`, unsigned macOS `Testrix-mac-arm64.dmg` and `Testrix-mac-x64.dmg`, and Linux x64 `Testrix-linux-x86_64.AppImage` and `Testrix-linux-amd64.deb`. It publishes those files on the GitHub release with the changelog, and uploads `<channel>.json` and `<channel>.json.sig` to the `updates` release. The signed manifest still points at `Testrix.exe`. In-app updates are Windows-only.

## What the workflow publishes

`Testrix.exe` is a portable Electron shell with an appended `payload.zip` and `TESTRIXPK` footer. macOS and Linux artifacts are electron-builder packages of the same desktop app (`npm run electron:pack:desktop` on that OS). They are unsigned, and they are not fed to the Windows updater.

Manifests live on a fixed release tagged `updates`, because GitHub's `releases/latest` never resolves to a pre-release. Don't delete that release. Each manifest looks like this:

```json
{
  "version": "2.1.0-beta.1",
  "channel": "beta",
  "releasedAt": "2026-10-01T09:00:00.000Z",
  "notes": "### Added\n\n- …",
  "url": "https://github.com/matthiaskopeinigg/testrix/releases/download/v2.1.0-beta.1/Testrix.exe",
  "sha512": "<base64 SHA-512 of the installer>",
  "size": 123456789,
  "minVersion": "2.0.0"
}
```

`minVersion` is optional. Pass `--min-version` to `tooling/scripts/release-manifest.mjs` when older installs must step through an intermediate release first.

## Building locally

```bash
npm run build
npm run electron:pack
```

On macOS or Linux, `npm run electron:pack:desktop` writes the dmg, AppImage, and deb into `release/` instead of `Testrix.exe`.

`electron-builder` must run with `--project apps/desktop`. Without that, version 26 treats the workspace root as the app and looks for `src/splash` and `index.js` in the wrong place. Both the desktop payload and the Setup shell pin `electronVersion` to `44.3.0`; a caret range such as `^44.3.0` is rejected.

Windows native modules (`better-sqlite3`) need the Visual Studio **Desktop development with C++** workload to rebuild for Electron 44. If those tools are missing, pack skips the rebuild and still writes `Testrix.exe`. Database features in that installer stay built for Node, not Electron. Force a rebuild with `TESTRIX_FORCE_NATIVE_REBUILD=1`, or skip one with `TESTRIX_SKIP_NATIVE_REBUILD=1`.

The installer lands in `release/setup-shell-build/Testrix.exe`. To dry-run the manifest step against it:

```bash
node tooling/scripts/release-manifest.mjs --exe release/setup-shell-build/Testrix.exe \
  --key-file .secrets/update-signing-key.pem --out release/update
```

## Trying the updater locally

Packaged installs only accept GitHub manifests signed with `UPDATE_PUBLIC_KEY`. A local unpackaged run can check a loopback server that uses the same URL layout as GitHub Releases.

```bash
npm run updater:local
```

That packs `Testrix.exe` (unless you pass `--skip-pack` and the file already exists), signs `99.0.0` manifests, and serves:

- `/{repository}/releases/download/updates/{stable|beta}.json` and `.sig`
- `/{repository}/releases/download/v99.0.0/Testrix.exe`

Signatures use `.secrets/update-signing-key.pem` when it is present, so the key baked into the app verifies. Otherwise the script uses a throwaway key for this session only.

It writes `%TEMP%/testrix-local-releases.json` (origin, public key, throwaway install dir and profile). Leave the server running, then in another terminal:

```bash
npm start
```

Or start both with `npm run updater:local -- --launch`. Open **Settings → Updates**. **Check now** fetches the GitHub-shaped manifest; **Download** stores the installer under the throwaway profile; **Install update** opens Setup’s update window and swaps the throwaway install folder.

Useful flags: `--skip-pack`, `--launch`, `--port`, `--version`, `--exe <Testrix.exe>`. `npm run updater:preview` is an alias of `updater:local`.

Packaged builds ignore the discovery file and the `TESTRIX_UPDATE_*` environment variables.
