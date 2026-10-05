import type { SettingsCategory } from '../../settings/settings-registry';

export interface NetworkErrorSettingsLink {
  readonly category: Extract<SettingsCategory, 'certificates' | 'proxy'>;
  readonly highlightId: string;
  readonly label: string;
}

/**
 * Maps common HTTP/TLS/proxy error text to a Settings deep link.
 */
export function networkErrorSettingsLink(error: string | null | undefined): NetworkErrorSettingsLink | null {
  if (!error?.trim())
    return null;
  const lower = error.toLowerCase();
  if (
    lower.includes('certificate')
    || lower.includes('cert_')
    || lower.includes('unable to verify')
    || lower.includes('self signed')
    || lower.includes('self-signed')
    || lower.includes('ssl')
    || lower.includes('tls')
    || lower.includes('unknown ca')
    || lower.includes('err_cert')
    || lower.includes('peer certificate')
  ) {
    return {
      category: 'certificates',
      highlightId: 'tls-verify',
      label: 'Open Certificates',
    };
  }
  if (
    lower.includes('proxy')
    || lower.includes('socks')
    || lower.includes('tunnel')
    || lower.includes('407')
    || lower.includes('proxy authentication')
  ) {
    return {
      category: 'proxy',
      highlightId: 'proxy-mode',
      label: 'Open Proxy',
    };
  }
  return null;
}
