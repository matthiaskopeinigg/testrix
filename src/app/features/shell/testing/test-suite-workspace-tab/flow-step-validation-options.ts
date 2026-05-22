import {
  validationSourcesForReferenceStepType,
  type TestSuiteStepType,
} from '@shared/testing';
import type { ValidationRule } from '@shared/testing';

import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';

const VALIDATION_SOURCE_LABELS: Record<ValidationRule['source'], string> = {
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

/** Dropdown options for validation rule sources based on the reference step type. */
export function buildValidationSourceOptions(
  refStepType: TestSuiteStepType | null | undefined,
): readonly TxDropdownOption[] {
  return validationSourcesForReferenceStepType(refStepType).map((source) => ({
    value: source,
    label: VALIDATION_SOURCE_LABELS[source],
  }));
}

/** Hint shown under the reference step field. */
export function validationReferenceHint(
  refStepType: TestSuiteStepType | null | undefined,
): string {
  switch (refStepType) {
    case 'E2E':
      return 'Assert element text, HTML, presence, or page URL / redirect from the referenced browser step.';
    case 'REQUEST':
      return 'Assert HTTP response status, body, or headers from the referenced request.';
    case 'HTTP_LISTENER':
    case 'HTTP_INTERCEPTOR':
      return 'Assert captured HTTP traffic from the referenced listener or interceptor step.';
    default:
      return 'Pick a prior request, E2E, listener, or interceptor step to validate against.';
  }
}

/** Label for the expression field (header name, etc.). */
export function validationExpressionLabel(source: ValidationRule['source']): string | null {
  switch (source) {
    case 'response_header':
    case 'request_header':
      return 'Header name';
    default:
      return null;
  }
}
