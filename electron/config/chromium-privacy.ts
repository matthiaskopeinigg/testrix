import { app } from 'electron';

/**
 * Disables Chromium background network features before `app.whenReady()`.
 *
 * The packaged renderer must stay local-only. GitHub Releases traffic is
 * limited to the main-process auto-updater.
 *
 * On Windows, `CalculateNativeWinOcclusion` is also disabled so mouse input
 * works in the embedded Chromium window.
 */
export function configureChromiumPrivacySwitches(): void {
  const disabledFeatures = [
    'AutofillServerCommunication',
    'NetworkTimeServiceQuerying',
    'OptimizationHints',
    'InterestFeedContentSuggestions',
    'CertificateTransparencyComponentUpdater',
  ];
  if (process.platform === 'win32') {
    disabledFeatures.unshift('CalculateNativeWinOcclusion');
  }
  app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','));
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('metrics-recording-only');
  app.commandLine.appendSwitch('no-pings');
}

configureChromiumPrivacySwitches();
