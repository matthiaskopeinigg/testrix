import { describe, expect, it } from 'vitest';

import { environmentVariablesToCatalog } from '../config/environment-variables';
import {
  findTemplateVariableSuggestions,
  resolveTemplateVariables,
} from './template-variables';
import { DYNAMIC_VARIABLES } from './dynamic-variables';

describe('template-variables', () => {
  const catalog = [
    ...DYNAMIC_VARIABLES,
    ...environmentVariablesToCatalog([{ key: 'baseUrl', value: 'https://api.example.com' }], 'Dev'),
  ];

  it('suggests environment placeholders after {{', () => {
    const text = 'GET {{ba';
    const result = findTemplateVariableSuggestions(text, text.length, catalog);
    expect(result?.items.some((item) => item.insert === '{{baseUrl}}')).toBe(true);
    expect(result?.context.replaceStart).toBe(4);
  });

  it('includes empty }} stub in replace range for {{}}', () => {
    const text = '{\n  "k": {{}}';
    const open = text.indexOf('{{');
    const caret = open + 2;
    const result = findTemplateVariableSuggestions(text, caret, catalog);
    expect(result?.context.replaceEnd).toBe(open + 4);
  });

  it('resolves environment placeholders then $ variables', () => {
    const out = resolveTemplateVariables('{{baseUrl}}/ids/$uuid', {
      environment: { baseUrl: 'https://api.example.com' },
      randomUuid: () => 'fixed-uuid',
    });
    expect(out).toBe('https://api.example.com/ids/fixed-uuid');
  });
});
