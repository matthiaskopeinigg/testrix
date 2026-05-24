; Cached bootstrap for Testrix Setup — extracts once, then launches the Electron
; setup shell from disk (no electron-builder portable re-extract on every run).
;
; Build via scripts/build-setup-cache-launcher.mjs (defines OUT_FILE, STAGING, PRODUCT_VERSION).

Unicode true
RequestExecutionLevel user
SetCompressor /SOLID lzma

Name "Testrix Setup"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Testrix\SetupCache\${PRODUCT_VERSION}"
ShowInstDetails show
AutoCloseWindow true

Section ""
  SetOutPath "$INSTDIR"

  IfFileExists "$INSTDIR\payload\Testrix.exe" launch 0

  DetailPrint "Preparing Testrix Setup..."
  RMDir /r "$INSTDIR"
  CreateDirectory "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${STAGING}\*.*"

launch:
  DetailPrint "Starting Testrix Setup..."
  Exec '"$INSTDIR\Testrix Setup.exe"'
  Quit
SectionEnd
