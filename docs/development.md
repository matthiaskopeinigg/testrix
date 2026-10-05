# Development

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Quality gates:

```bash
npm run verify     # lint, styles, format, typecheck, coverage, component tests, doc links
npm run test:all   # verify + build + Playwright e2e
```

Useful flags:

- `TESTRIX_NO_SPLASH=1` — skip splash
- `TESTRIX_DEV_URL` — override Angular origin (default `http://localhost:4200`)
- `TESTRIX_COMPARE=1` — force a separate userData / AppUserModelID so this build can run next to another Testrix install
- `npm run preview:splash` — hold the splash window open
- `npm run preview:boot-error` — startup failure card
- `npm run preview:app-error` — workbench crash card
- `npm run preview:installer` — installer UI without a release payload
- `npm run preview:uninstaller` — uninstaller UI
- `npm run updater:local` — pack, then serve a GitHub-shaped local release feed. Run `npm start` in another terminal (or pass `--launch`). See [releasing.md](releasing.md#trying-the-updater-locally).

### Test databases

Docker Desktop (Linux containers) is required.

```bash
npm run db:up          # start engines
npm run db:ps          # status
npm run db:down        # stop
npm run db:reset       # wipe volumes and start again
```

`npm run db:up` brings up every server engine except Oracle. Add Oracle with:

```bash
docker compose --project-directory docker --profile oracle up -d
```

SQLite is a file path in the connection tab, not a container.

Wait until `npm run db:ps` shows healthy, then Test from a New Connection tab. Leave TLS off.

| Type | Port | User | Password | Database |
| --- | --- | --- | --- | --- |
| PostgreSQL | 5432 | testrix | testrix | testrix |
| MySQL | 3306 | testrix | testrix | testrix |
| MariaDB | **3307** | testrix | testrix | testrix |
| SQL Server | 1433 | sa | `Testrix_Dev1!` | testrix |
| Redis | 6379 | | | |
| MongoDB | 27017 | | | testrix |
| Oracle | 1521 | testrix | testrix1 | FREEPDB1 |

Host is `localhost` for all of them. Oracle uses a service name (`FREEPDB1`); leave **Use SID** unchecked. Each SQL engine seeds related sample tables (`categories`, `customers`, `orders`, `order_items`, `sample_items`) plus indexes, a view, a routine, and a trigger where the engine allows it. MongoDB seeds `sample_items` and `categories`.

### Android emulator

Settings → Android can install a managed SDK so the desktop app starts an emulator without Android Studio.

1. Turn on **Activate emulator**.
2. Accept the Android SDK license.
3. Testrix downloads platform-tools, the emulator, and one system image (Google APIs by default, or Google Play Store when that option is checked — about 2–3 GB+) into `%APPDATA%/Testrix-2.0-dev/android-sdk` (or the packaged app’s userData). The AVD `testrix` lives in `android-avd`.
4. **Start** from Services → Emulator opens the official emulator window outside Angular. On Windows the window is renamed to Testrix and keeps a dark system titlebar so you can move and resize it. Activate only installs tools — it does not start the window.

Services → Emulator is the day-to-day console: Activate (license + download in Settings), add virtual device profiles (Pixel and similar), start/stop the selected device, and keep a shared APK library (local file or official F-Droid `index-v1.json`). A Play Store details URL is parsed for `id=` (package name) and can open `market://` on a device; Testrix never downloads Play Store or APKMirror APKs. Flow Device nodes (`device-install`, `device-launch`, tap/type/press/swipe/wait/screenshot/assert) run through ADB in the desktop process. Empty serial/APK fields read `emulator.json`, then the first online device. If nothing is online, the flow starts AVD `testrix` for the selected device profile unless the flow turns that off.

The first Activate needs the network. Later starts reuse the disk cache. Windows needs Windows Hypervisor Platform and Virtual Machine Platform (admin, often a reboot). Linux needs KVM. macOS already has Hypervisor.framework.

`Remove Android tools` deletes only the managed folders under userData. An existing `ANDROID_HOME` / Android Studio SDK is not deleted.

CI does not start an emulator. Unit tests cover path resolution, the license gate, catalog / `adb devices` parsing, uiautomator hierarchy parse, F-Droid index search, Play Store package-id parse, and `emulator.json` defaults.

### Side-by-side with an older Testrix install

`npm start` / `npm run dev` already use a separate profile (`%APPDATA%/Testrix-2.0-dev`) and Windows AppUserModelID, so the installed app and this repo can stay open together. The title bar chip shows `2.0 · Local` so you can tell them apart.
