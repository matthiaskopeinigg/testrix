/** Electron sandboxed preload has `process` as a global, not as require('process'). */
module.exports = globalThis.process
