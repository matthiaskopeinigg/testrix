import { orderTools } from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { transformBase64 } from '../workbench/tools/base64-codec';
import { joinCronFields, nextCronTimes, parseCron } from '../workbench/tools/cron-builder';
import { generatePassword } from '../workbench/tools/password-generator';
import { testRegex } from '../workbench/tools/regex-tester';
import { applyQueryPairs, parseQueryPairs, transformUrl } from '../workbench/tools/url-codec';

/**
 * End-to-end style journeys for Tools without a browser driver.
 * Walks catalog order → encode/decode → cron/url/regex/password utilities.
 */
describe('Tools e2e journeys', () => {
  it('reorders the catalog then round-trips Base64 and URL codecs', () => {
    const ordered = orderTools(['url-codec', 'base64']);
    expect(ordered[0]?.id).toBe('url-codec');
    expect(ordered[1]?.id).toBe('base64');

    const encoded = transformBase64('testrix', 'encode', false);
    expect(encoded.error).toBeNull();
    const decoded = transformBase64(encoded.value, 'decode', false);
    expect(decoded).toEqual({ value: 'testrix', error: null });

    const component = transformUrl('hello world', 'encode', 'component');
    expect(component.error).toBeNull();
    expect(component.value).toContain('%20');
    const pairs = parseQueryPairs('a=1&b=two');
    expect(applyQueryPairs('https://example.test', pairs)).toContain('a=1');
  });

  it('builds a weekday cron, matches a haystack, and mints a local password', () => {
    const fields = { minute: '15', hour: '9', dom: '*', month: '*', dow: '1-5' };
    const expression = joinCronFields(fields);
    expect(parseCron(expression).error).toBeNull();
    expect(nextCronTimes(expression, new Date('2026-03-02T08:00:00'), 2)).toHaveLength(2);

    const matches = testRegex('te(st)', ['g'], 'test this test');
    expect(matches.error).toBeNull();
    expect(matches.matches).toHaveLength(2);

    const secret = generatePassword({
      length: 24,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
      lookalikes: false,
    });
    expect(secret.length).toBe(24);
    expect(secret).not.toMatch(/[0O1lI]/);
  });
});
