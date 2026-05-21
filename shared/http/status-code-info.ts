export interface StatusCodeInfo {
  readonly title: string;
  readonly description: string;
  readonly mdnUrl?: string;
}

export const STATUS_CODE_INFO: Readonly<Record<number, StatusCodeInfo>> = {
  200: {
    title: 'OK',
    description: 'The request succeeded. The body contains the requested data.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/200',
  },
  201: {
    title: 'Created',
    description: 'A new resource was created as a result of the request.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/201',
  },
  204: {
    title: 'No Content',
    description: 'The request succeeded and there is no body to return.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/204',
  },
  301: {
    title: 'Moved Permanently',
    description: 'The resource has a new permanent URL.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/301',
  },
  302: {
    title: 'Found',
    description: 'The resource is temporarily at a different URL.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/302',
  },
  304: {
    title: 'Not Modified',
    description: 'The cached version is still valid.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/304',
  },
  400: {
    title: 'Bad Request',
    description: 'The server could not understand the request.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/400',
  },
  401: {
    title: 'Unauthorized',
    description: 'Authentication is required and was not provided or failed.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/401',
  },
  403: {
    title: 'Forbidden',
    description: 'You are not allowed to perform this action.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/403',
  },
  404: {
    title: 'Not Found',
    description: 'The server has no resource matching this URL.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/404',
  },
  429: {
    title: 'Too Many Requests',
    description: 'Rate limited. Slow down and try again later.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/429',
  },
  500: {
    title: 'Internal Server Error',
    description: 'The server hit an unhandled error.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/500',
  },
  502: {
    title: 'Bad Gateway',
    description: 'An upstream server returned an invalid response.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/502',
  },
  503: {
    title: 'Service Unavailable',
    description: 'The server is overloaded or down for maintenance.',
    mdnUrl: 'https://developer.mozilla.org/docs/Web/HTTP/Status/503',
  },
};

export function classInfoForStatus(code: number): StatusCodeInfo {
  if (code === 0) {
    return {
      title: 'Network error',
      description: 'The request never reached the server (DNS, timeout, or connection failure).',
    };
  }
  if (code >= 100 && code < 200) {
    return { title: 'Informational', description: '1xx — request received, processing continues.' };
  }
  if (code >= 200 && code < 300) {
    return { title: 'Success', description: '2xx — request succeeded.' };
  }
  if (code >= 300 && code < 400) {
    return { title: 'Redirect', description: '3xx — further action needed (usually follow redirect).' };
  }
  if (code >= 400 && code < 500) {
    return { title: 'Client error', description: '4xx — request was malformed or refused.' };
  }
  if (code >= 500 && code < 600) {
    return { title: 'Server error', description: '5xx — server failed to fulfill a valid request.' };
  }
  return { title: 'Unknown', description: 'Status code outside standard HTTP ranges.' };
}

export function describeStatus(code: number): StatusCodeInfo {
  return STATUS_CODE_INFO[code] ?? classInfoForStatus(code);
}
