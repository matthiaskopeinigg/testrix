/**
 * Config file names and schema version constants.
 */
export const CURRENT_SETTINGS_SCHEMA_VERSION = 1;
export const CURRENT_SESSION_SCHEMA_VERSION = 1;
export const CURRENT_PATHS_ANCHOR_SCHEMA_VERSION = 2;
export const CURRENT_COLLECTIONS_SCHEMA_VERSION = 1;
export const CURRENT_ENVIRONMENTS_SCHEMA_VERSION = 1;

export const SETTINGS_FILE_NAME = 'settings.json';
export const SESSION_FILE_NAME = 'session.json';
export const PATHS_ANCHOR_FILE_NAME = 'paths.json';
export const COLLECTIONS_FILE_NAME = 'collections.json';
export const ENVIRONMENTS_FILE_NAME = 'environments.json';
export const PROFILES_FILE_NAME = 'profiles.json';
export const HISTORY_FILE_NAME = 'history.json';
export const COOKIE_JAR_FILE_NAME = 'cookie-jar.json';
export const TEST_SUITES_FILE_NAME = 'test-suites.json';
export const LOAD_TESTS_FILE_NAME = 'load-tests.json';
export const REGRESSIONS_FILE_NAME = 'regressions.json';
export const MOCK_SERVER_FILE_NAME = 'mock.json';
export const CAPTURE_FILE_NAME = 'capture.json';
export const INTERCEPTOR_FILE_NAME = 'interceptor.json';

/** Default `ng serve` port — avoids clashing with other Angular apps on 4200. */
export const TESTRIX_DEV_SERVER_PORT = 4720;

export const TESTRIX_DEV_SERVER_HOST = 'localhost';

/** Marker in `src/index.html` so Electron does not load another app on the same port. */
export const TESTRIX_DEV_SERVER_HTML_MARKER = 'name="testrix-app"';
