import {
  DEFAULT_TOOLS,
  TOOL_IDS,
  isToolId,
  orderTools,
  parseToolOrderIds,
  toolById,
} from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { moveByInsertIndex } from '../environments/environments-drop-model';
import { transformBase64 } from '../workbench/tools/base64-codec';
import { nextCronTimes, parseCron, summarizeCron } from '../workbench/tools/cron-builder';
import { decodeJwt } from '../workbench/tools/jwt-toolkit';
import { generatePassword, passwordEntropy } from '../workbench/tools/password-generator';
import { testRegex } from '../workbench/tools/regex-tester';
import { transformUrl } from '../workbench/tools/url-codec';

describe('ToolsSidebarComponent (catalog)', () => {
  it('ships eight tools in the default catalog', () => {
    expect(TOOL_IDS).toHaveLength(8);
    expect(DEFAULT_TOOLS.map((item) => item.id)).toEqual([...TOOL_IDS]);
    expect(isToolId('uuid-generator')).toBe(true);
    expect(isToolId('not-a-tool')).toBe(false);
    expect(toolById('jwt-toolkit')?.label).toBe('JWT Toolkit');
  });

  it('reorders the sidebar while appending unknown catalog tools', () => {
    const ordered = orderTools(['password-generator', 'base64', 'mystery']);
    expect(ordered.map((item) => item.id)[0]).toBe('password-generator');
    expect(ordered.map((item) => item.id)[1]).toBe('base64');
    expect(ordered).toHaveLength(TOOL_IDS.length);
    expect(parseToolOrderIds(['uuid-generator', 12, 'cron-builder'])).toEqual([
      'uuid-generator',
      'cron-builder',
    ]);
  });

  it('moves a dragged tool by insert index', () => {
    const rows = orderTools([]).map((item) => ({ id: item.id }));
    const next = moveByInsertIndex(rows, 'base64', 0);
    expect(next?.map((row) => row.id)[0]).toBe('base64');
  });
});

describe('Tool editors (workbench surfaces)', () => {
  it('encodes and decodes Base64 with URL-safe alphabet', () => {
    const encoded = transformBase64('hello', 'encode', true);
    expect(encoded.error).toBeNull();
    expect(encoded.value).not.toContain('+');
    const decoded = transformBase64(encoded.value, 'decode', true);
    expect(decoded).toEqual({ value: 'hello', error: null });
  });

  it('rejects an invalid JWT and parses a cron preview', () => {
    expect(decodeJwt('not.a.jwt').error).toBeTruthy();
    const cron = parseCron('0 9 * * 1-5');
    expect(cron.error).toBeNull();
    expect(cron.parsed).toBeTruthy();
    expect(summarizeCron('0 9 * * 1-5').length).toBeGreaterThan(0);
    expect(nextCronTimes('0 9 * * 1-5', new Date('2026-01-05T08:00:00'), 3)).toHaveLength(3);
  });

  it('encodes URL components, matches regex groups, and sizes password entropy', () => {
    const url = transformUrl('a b', 'encode', 'component');
    expect(url).toEqual({ value: 'a%20b', error: null });

    const regex = testRegex('(\\w+)', ['g'], 'hi there');
    expect(regex.error).toBeNull();
    expect(regex.matches.length).toBeGreaterThan(0);

    const options = {
      length: 16,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: false,
      lookalikes: false,
    };
    expect(passwordEntropy(options).bits).toBeGreaterThan(40);
    expect(
      generatePassword({
        length: 12,
        lowercase: true,
        uppercase: false,
        digits: true,
        symbols: false,
        lookalikes: false,
      }).length,
    ).toBe(12);
  });
});
