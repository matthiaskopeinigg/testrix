export interface UrlTransformInput {
  readonly value: string;
  readonly encode: boolean;
  readonly componentOnly: boolean;
}

export interface UrlTransformResult {
  readonly output: string;
  readonly error: string | null;
}

export function transformUrl(input: UrlTransformInput): UrlTransformResult {
  const { value, encode, componentOnly } = input;
  if (!value) {
    return { output: '', error: null };
  }
  try {
    const output = encode
      ? componentOnly
        ? encodeURIComponent(value)
        : encodeURI(value)
      : componentOnly
        ? decodeURIComponent(value)
        : decodeURI(value);
    return { output, error: null };
  } catch {
    return { output: '', error: 'Invalid percent-encoding in the input.' };
  }
}

export interface ParsedUrlParts {
  readonly href: string;
  readonly protocol: string;
  readonly host: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly username: string;
  readonly password: string;
  readonly queryEntries: readonly { readonly key: string; readonly value: string }[];
  readonly error: string | null;
}

export function parseUrl(value: string): ParsedUrlParts {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      href: '',
      protocol: '',
      host: '',
      port: '',
      pathname: '',
      search: '',
      hash: '',
      username: '',
      password: '',
      queryEntries: [],
      error: null,
    };
  }
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    const queryEntries: { key: string; value: string }[] = [];
    url.searchParams.forEach((v, k) => queryEntries.push({ key: k, value: v }));
    return {
      href: url.href,
      protocol: url.protocol,
      host: url.host,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      username: url.username,
      password: url.password ? '••••••' : '',
      queryEntries,
      error: null,
    };
  } catch {
    return {
      href: '',
      protocol: '',
      host: '',
      port: '',
      pathname: '',
      search: '',
      hash: '',
      username: '',
      password: '',
      queryEntries: [],
      error: 'Could not parse URL. Include a scheme or use a full https:// example.',
    };
  }
}
