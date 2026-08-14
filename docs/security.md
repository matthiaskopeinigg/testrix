# Security (handbook)

This page summarizes how Testrix is structured for safer desktop operation. For vulnerability **reporting**, use [SECURITY.md](../SECURITY.md).

## Process isolation

- Renderer runs with **`contextIsolation: true`** and **`nodeIntegration: false`**
- Preload exposes a narrow `window.testrix` API; prefer typed `invoke` channels over ad-hoc bridges
- Splash and static error windows stay preload-free

## Content Security Policy

Main session applies CSP via `session.defaultSession.webRequest`:

- Production: strict `script-src 'self'` (limited inline parity for Angular bundles where required)
- Dev: allows the configured renderer origin (default `localhost:4720`) and WebSocket

## Secrets and config

- Collection secrets, environments, and settings live under the user **config root** (see README), not inside the installer payload
- Do not commit `.env`, certs, or `CSC_*` material
- Release signing uses GitHub Actions secrets only on tagged releases

## Supply chain

- CI installs with `npm ci`
- Dependabot opens weekly updates; prefer grouped Angular / electron-builder PRs
- Report compromised dependency findings through the SECURITY.md process
