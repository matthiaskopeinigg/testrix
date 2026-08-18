import { resolveVariableMapValues } from '../config/resolve-request-variables';
import { resolveDynamicVariables } from '../dynamic-variables/dynamic-variables';
import { resolveTemplateVariables } from '../dynamic-variables/template-variables';
import { normalizeFlowVariableRecord } from '../testing/flow-variable-key';

import { resolveEncodedBodyTemplates } from './encode-request-body';
import { encodedRequestBodySchema } from './encoded-body.schema';
import type { OutgoingHttpRequest } from './outgoing-request.schema';

/**
 * Re-applies CACHE / MANUAL / DATABASE aliases to an already-built outgoing request.
 * A leftover `{{email}}` in the URL is substituted even when the first build missed the map.
 */
export function applySharedVariablesToOutgoingRequest(
  outgoing: OutgoingHttpRequest,
  sharedVariables: Readonly<Record<string, string>>,
): OutgoingHttpRequest {
  const environment = resolveVariableMapValues({
    ...normalizeFlowVariableRecord(outgoing.variableContext),
    ...normalizeFlowVariableRecord(sharedVariables),
  });
  const resolveText = (text: string): string =>
    resolveDynamicVariables(resolveTemplateVariables(text, { environment }));

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(outgoing.headers)) {
    headers[key] = resolveText(value);
  }

  return {
    ...outgoing,
    url: resolveTemplateVariables(outgoing.url, { environment }),
    headers,
    body: encodedRequestBodySchema.parse(resolveEncodedBodyTemplates(outgoing.body, resolveText)),
    variableContext: { ...environment },
  };
}
