/** Minimal logger shim for ported api-workbench E2E services. */

function logInfo(message, ...args) {
  console.log(`[testrix:e2e] ${message}`, ...args);
}

function logError(message, err, ...args) {
  console.error(`[testrix:e2e] ${message}`, err, ...args);
}

module.exports = { logInfo, logError };
