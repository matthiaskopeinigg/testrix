import { describe, expect, it } from 'vitest';

import { DEFAULT_TOOLS, isToolId, orderTools, parseToolOrderIds, TOOL_IDS } from './tools';

describe('orderTools', () => {
  it('keeps catalog order when no prefs exist', () => {
    expect(orderTools([]).map((item) => item.id)).toEqual(DEFAULT_TOOLS.map((item) => item.id));
  });

  it('ignores unknown ids and appends new tools', () => {
    expect(orderTools(['missing', 'uuid-generator']).map((item) => item.id)).toEqual([
      'uuid-generator',
      'base64',
      'jwt-toolkit',
      'cron-builder',
      'url-codec',
      'regex-builder',
      'password-generator',
      'plantuml',
    ]);
  });

  it('preserves a saved order and appends the rest', () => {
    expect(orderTools(['password-generator', 'uuid-generator']).map((item) => item.id)).toEqual([
      'password-generator',
      'uuid-generator',
      'base64',
      'jwt-toolkit',
      'cron-builder',
      'url-codec',
      'regex-builder',
      'plantuml',
    ]);
  });
});

describe('isToolId', () => {
  it('accepts catalog ids', () => {
    expect(isToolId('uuid-generator')).toBe(true);
    expect(isToolId('plantuml')).toBe(true);
    expect(isToolId('drawio')).toBe(false);
    expect(isToolId('http-login')).toBe(false);
  });
});

describe('TOOL_IDS', () => {
  it('lists every catalog id', () => {
    expect(TOOL_IDS).toEqual(DEFAULT_TOOLS.map((item) => item.id));
  });
});

describe('parseToolOrderIds', () => {
  it('keeps string ids and drops junk', () => {
    expect(parseToolOrderIds(['uuid-generator', 2, '', null])).toEqual(['uuid-generator']);
    expect(parseToolOrderIds(null)).toEqual([]);
  });
});
