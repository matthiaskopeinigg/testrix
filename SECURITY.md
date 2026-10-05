# Security policy

## Supported versions

Security fixes are applied on the active development line (currently `2.0.x` beta). Older major versions are not supported.

## Reporting a vulnerability

**Please do not open a public GitHub Issue for security vulnerabilities.**

### Preferred: GitHub Security Advisories

If you have access to this repository on GitHub:

1. Open the repository on GitHub.
2. Go to **Security** → **Advisories**.
3. Choose **Report a vulnerability** (private advisory).
4. Include steps to reproduce, impact, and any suggested fix.

Maintainers will acknowledge receipt, work on a fix, and coordinate disclosure through the advisory workflow.

### Alternative: private contact

If you cannot use Security Advisories, contact the repository owner privately with the same information (reproduction steps, affected versions, impact). Do not disclose the issue publicly until a fix is available or we agree on a timeline.

## What we consider in scope

- Remote code execution or privilege escalation through Testrix IPC or the preload boundary
- Sandbox escapes or unintended Node/Electron exposure in the renderer
- Unsafe handling of secrets (collections, environments, and workspace export packs)
- Installer or update path issues that could lead to arbitrary code execution (including a forged update manifest)

Windows installers are not Authenticode-signed. Treat an installer that did not come from this GitHub repository, or an update whose Ed25519 signature or SHA-512 does not match, as untrusted. See [NOTICE](NOTICE).

## Out of scope

- Issues that require physical access to an unlocked machine and an already-trusted Testrix profile
- Social engineering against individual users
- Vulnerabilities in third-party services you call with Testrix (your APIs and databases)

## Secure design expectations

Testrix runs the Angular workbench with **context isolation**, **sandbox**, and **`nodeIntegration: false`**. CSP is applied on `session.defaultSession`. Setup and splash have no Node in the page; Setup uses a dedicated preload. Do not expose filesystem or shell APIs on `window.testrix`. Network access is mediated by the Electron main process.

Contributors must not add Node or Electron imports to `apps/renderer` or `@testrix/ui`.

## Recognition

We appreciate responsible disclosure. With your permission, we may credit reporters in release notes or advisories.
