import vm from 'node:vm';

export interface ScriptRequestState {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
  cookies: { name: string; value: string }[];
  variables: Record<string, string>;
  status: number;
  statusText: string;
}

const SCRIPT_TIMEOUT_MS = 1000;

function cloneState(state: ScriptRequestState): ScriptRequestState {
  return {
    method: state.method,
    url: state.url,
    headers: state.headers.map((row) => ({ ...row })),
    body: state.body,
    cookies: state.cookies.map((row) => ({ ...row })),
    variables: { ...state.variables },
    status: state.status,
    statusText: state.statusText,
  };
}

function headerIndex(headers: { key: string; value: string }[], key: string): number {
  const needle = key.trim().toLowerCase();
  return headers.findIndex((row) => row.key.trim().toLowerCase() === needle);
}

function createSandbox(next: ScriptRequestState) {
  const bag = next.variables;
  const variables = new Proxy(bag, {
    get(target, prop, receiver) {
      if (prop === 'get')
        return (name: string) => (typeof name === 'string' ? (target[name] ?? '') : '');
      if (prop === 'set') {
        return (name: string, value: unknown) => {
          if (typeof name === 'string' && name.trim())
            target[name.trim()] = value == null ? '' : String(value);
        };
      }
      if (prop === 'unset') {
        return (name: string) => {
          if (typeof name === 'string')
            delete target[name];
        };
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      if (typeof prop !== 'string')
        return false;
      target[prop] = value == null ? '' : String(value);
      return true;
    },
  });

  const request = {
    get method() {
      return next.method;
    },
    set method(value: string) {
      if (typeof value === 'string' && value.trim())
        next.method = value.trim().toUpperCase();
    },
    get url() {
      return next.url;
    },
    set url(value: string) {
      if (typeof value === 'string')
        next.url = value;
    },
    get body() {
      return next.body;
    },
    set body(value: string) {
      if (typeof value === 'string')
        next.body = value;
    },
    headers: next.headers,
    addHeader(key: string, value: string): void {
      if (typeof key !== 'string' || !key.trim())
        return;
      const index = headerIndex(next.headers, key);
      const row = { key: key.trim(), value: value == null ? '' : String(value) };
      if (index >= 0)
        next.headers[index] = row;
      else
        next.headers.push(row);
    },
    removeHeader(key: string): void {
      const index = headerIndex(next.headers, key);
      if (index >= 0)
        next.headers.splice(index, 1);
    },
  };

  const response = {
    get code() {
      return next.status;
    },
    get status() {
      return next.status;
    },
    get statusText() {
      return next.statusText;
    },
    get body() {
      return next.body;
    },
    get headers() {
      return next.headers;
    },
    json(): unknown {
      const text = next.body.trim();
      if (!text)
        return null;
      return JSON.parse(text) as unknown;
    },
  };

  function test(_name: string, fn: unknown): void {
    if (typeof fn === 'function')
      (fn as () => void)();
  }

  return { request, response, cookies: next.cookies, variables, test };
}

/**
 * Runs a user script against a frozen-ish `tx` object. `pm` is a Postman-shaped alias.
 * No require, fetch, or filesystem.
 */
export function runCollectionScript(source: string, state: ScriptRequestState): ScriptRequestState {
  const code = source.trim();
  if (!code)
    return {
      ...state,
      status: state.status ?? 0,
      statusText: state.statusText ?? '',
    };
  const next = cloneState({
    ...state,
    status: state.status ?? 0,
    statusText: state.statusText ?? '',
  });
  const api = createSandbox(next);
  const context = vm.createContext({
    tx: api,
    pm: api,
    console: { log() {}, warn() {}, error() {}, info() {} },
  });
  vm.runInContext(code, context, { timeout: SCRIPT_TIMEOUT_MS, displayErrors: false });
  return next;
}

export function runCollectionScripts(
  sources: readonly string[],
  state: ScriptRequestState,
): ScriptRequestState {
  let current: ScriptRequestState = {
    ...state,
    status: state.status ?? 0,
    statusText: state.statusText ?? '',
  };
  for (const source of sources)
    current = runCollectionScript(source, current);
  return current;
}
