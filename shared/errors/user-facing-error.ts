import type { ErrorCode } from './error-codes';
import { ErrorCodes } from './error-codes';

/**
 * Short banner titles for IPC error codes. Never interpolates the raw code —
 * those identifiers are for logs, not the UI.
 */
const USER_FACING_ERROR_TITLES = {
  CONFIG_READ_FAILED: 'Could not load settings',
  CONFIG_WRITE_FAILED: 'Could not save settings',
  CONFIG_VALIDATION_FAILED: 'Invalid settings',
  CONFIG_DIR_NOT_WRITABLE: 'Could not write files',
  IPC_HANDLER_FAILED: 'Something went wrong',
  APP_BOOT_TIMEOUT: 'Testrix took too long to start',
  APP_LOAD_FAILED: 'Could not load Testrix',
  DEV_MOCK: 'Something went wrong',
  HTTP_REQUEST_FAILED: 'Request failed',
  HTTP_SCRIPT_TIMEOUT: 'Script timed out',
  HTTP_OAUTH_FAILED: 'Sign-in failed',
  VAULT_ENCRYPTION_UNAVAILABLE: 'Could not store secrets',
  SECRET_SCAN_BLOCKED: 'Secrets were blocked',
  LOAD_TEST_ALREADY_RUNNING: 'Load test already running',
  LOAD_TEST_TARGET_NOT_FOUND: 'Load test not found',
  REGRESSION_ALREADY_RUNNING: 'Regression already running',
  REGRESSION_NOT_FOUND: 'Regression not found',
  REGRESSION_ARCHIVED: 'Regression is archived',
  DATABASE_CONNECTION_FAILED: 'Database error',
} as const satisfies Record<ErrorCode, string>;

/**
 * Returns a short UI title for an internal error code.
 *
 * @param code - Stable error identifier from main or renderer.
 */
export function userFacingErrorTitle(code: string): string {
  if (code in USER_FACING_ERROR_TITLES) {
    return USER_FACING_ERROR_TITLES[code as ErrorCode];
  }
  return USER_FACING_ERROR_TITLES[ErrorCodes.IPC_HANDLER_FAILED];
}
