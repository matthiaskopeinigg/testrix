/** Electron sandboxed preload has `Buffer` as a global, not as require('buffer'). */
module.exports = { Buffer: globalThis.Buffer }
