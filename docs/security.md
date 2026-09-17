# Security

- Renderer: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
- CSP applied on `session.defaultSession`
- Setup and splash stay free of Node in the page; Setup uses a dedicated preload
- Do not expose filesystem or shell APIs on `window.testrix`
