import { COMMON_HTTP_HEADER_NAMES } from '@shared/http/common-http-header-names';
import { COMMON_HTTP_QUERY_PARAM_NAMES } from '@shared/http/common-http-query-param-names';
import {
  cacheSourcesForReferenceStepType,
  type TestSuiteStepType,
} from '@shared/testing';
import type { CacheStepEntry } from '@shared/testing';

import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';

const CACHE_SOURCE_LABELS: Record<CacheStepEntry['source'], string> = {
  response_status: 'Response status',
  response_body: 'Response body',
  response_header: 'Response header',
  request_body: 'Request body',
  request_header: 'Request header',
  request_param: 'Request param',
  cached_value: 'Cached value',
  e2e_element_text: 'Element text',
  e2e_element_html: 'Element HTML',
  e2e_selector_exists: 'Element exists',
  e2e_page_url: 'Page URL / redirect',
};

/** Dropdown options for cache entry sources based on the reference step type. */
export function buildCacheSourceOptions(
  refStepType: TestSuiteStepType | null | undefined,
): readonly TxDropdownOption[] {
  return cacheSourcesForReferenceStepType(refStepType).map((source) => ({
    value: source,
    label: CACHE_SOURCE_LABELS[source],
  }));
}

/** Hint shown under the reference step field. */
export function cacheReferenceHint(refStepType: TestSuiteStepType | null | undefined): string {
  switch (refStepType) {
    case 'E2E':
      return 'Save element text, HTML, or page URL from the referenced browser step.';
    case 'REQUEST':
      return 'Save HTTP response fields from the referenced request for later steps.';
    case 'HTTP_LISTENER':
    case 'HTTP_INTERCEPTOR':
      return 'Save captured HTTP traffic fields from the referenced step.';
    case 'DATABASE':
      return 'Save the cached query result from the referenced database step.';
    default:
      return 'Pick a prior step, then define variables to extract from its capture.';
  }
}

/** Label for the expression field (header name, etc.). */
export function cacheExpressionLabel(source: CacheStepEntry['source']): string | null {
  switch (source) {
    case 'response_header':
    case 'request_header':
      return 'Header name';
    case 'request_param':
      return 'Param name';
    default:
      return null;
  }
}

/** Suggestion catalog for cache expression fields, when applicable. */
export function cacheExpressionSuggestions(
  source: CacheStepEntry['source'],
): readonly string[] | null {
  switch (source) {
    case 'response_header':
    case 'request_header':
      return COMMON_HTTP_HEADER_NAMES;
    case 'request_param':
      return COMMON_HTTP_QUERY_PARAM_NAMES;
    default:
      return null;
  }
}
