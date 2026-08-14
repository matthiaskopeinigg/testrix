/**
 * Optional NSIS snippets for uninstaller-specific pages.
 * Wire additional pages or macros via electron-builder `nsis` options as the product evolves.
 */

!macro customUnInstall
  DetailPrint "Testrix uninstall removes binaries from $INSTDIR. Electron-managed config beside your profile is left intact unless extended here."

!macroend
