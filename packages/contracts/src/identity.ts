/**
 * Product identity shared by the desktop host, renderer, and Setup app.
 */
export const APP_ID = 'dev.testrix.app';

/**
 * Windows AppUserModelID and uninstall registry identity for Setup.
 */
export const SETUP_APP_ID = 'dev.testrix.app.setup';

/**
 * Display name used in chrome, installers, and OS shortcuts.
 */
export const PRODUCT_NAME = 'Testrix';

/**
 * FileDescription / package description written into packaged executables.
 */
export const PRODUCT_DESCRIPTION = 'Testrix — local-first desktop API workbench';

/**
 * Publisher / creator written into installers, version resources, and Add/Remove Programs.
 */
export const PUBLISHER_NAME = 'Matthias Kopeinigg';

/**
 * Copyright line for electron-builder and Windows version resources.
 */
export const COPYRIGHT = `Copyright © 2026 ${PUBLISHER_NAME}`;

/**
 * Main process executable name on Windows.
 */
export const MAIN_EXECUTABLE = 'Testrix.exe';

/**
 * Magic footer marker for the appended Setup payload.
 */
export const PAYLOAD_MAGIC = 'TESTRIXPK';
