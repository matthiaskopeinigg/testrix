<p align="center">
  <img src="assets/brand/logo.svg" alt="Testrix" width="160" />
</p>

# Testrix

[![CI](https://github.com/matthiaskopeinigg/testrix/actions/workflows/ci.yml/badge.svg)](https://github.com/matthiaskopeinigg/testrix/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/matthiaskopeinigg/testrix)](https://github.com/matthiaskopeinigg/testrix/releases/latest)

Local-first desktop API client built with **Angular 21** and **Electron**. Design collections and environments, send HTTP and WebSocket traffic, run test suites (including E2E), load tests, mocks, and capture — all on your machine.

## Features

- Collections, folders, and request workspaces with environments and dynamic variables
- HTTP and WebSocket clients with scripts, auth, cookies, and code snippets
- Test suites, flow steps, regression and load testing
- Mock servers, traffic capture, and interceptors
- JWT / crypto / regex and other built-in developer tools
- Theming and a shared `tx-*` UI kit

## Install

Download the latest installer from [GitHub Releases](https://github.com/matthiaskopeinigg/testrix/releases):

| OS | Artifact |
| --- | --- |
| Windows | `Testrix-Setup.exe` |
| macOS | `Testrix-Setup.dmg` |
| Linux | `Testrix-Setup.AppImage` |

Prerelease tags (for example `v1.0.0-beta.*`) publish unsigned Windows builds. Stable tags (`vX.Y.Z` without a hyphen) sign the Windows installer when `WIN_CSC_LINK` is configured; otherwise they ship unsigned as well.

## Develop

**Prerequisites:** Node **20+** (`.nvmrc` pins **22.12.0**), npm **11+**.

```bash
npm install
npm start          # Angular + Electron (splash on; no auto DevTools)
npm run dev        # same + TESTRIX_DEV=1 (DevTools, verbose logs)
npm test           # Vitest unit tests
npm run build      # production Angular + Electron bundle
```

Disable splash for faster Electron boot iterations:

```powershell
$env:TESTRIX_NO_SPLASH='1'; npm run dev
```

See [docs/development.md](docs/development.md) for the full script surface and flags.

## Config vs binaries

Installers place binaries where the OS expects. Runtime JSON (`settings.json`, `session.json`) lives under an **anchor-derived config directory**, not inside the installer path:

| OS | Default config root |
| --- | --- |
| Windows | `%USERPROFILE%\Documents\Testrix` |
| macOS | `~/Documents/Testrix` |
| Linux | `$XDG_CONFIG_HOME/testrix` or `~/.config/testrix` |

## Documentation

- [docs/](docs/README.md) — architecture, development, releasing, security
- [CONTRIBUTING.md](CONTRIBUTING.md) — coding standards and PR workflow
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [CHANGELOG.md](CHANGELOG.md) — release notes
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards

## License

[MIT](LICENSE)
