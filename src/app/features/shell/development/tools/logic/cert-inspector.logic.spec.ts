import { describe, expect, it } from 'vitest';

import { formatPemInspection, inspectPem } from './cert-inspector.logic';

describe('inspectPem', () => {
  it('summarizes a PEM certificate block', async () => {
    const der = new Uint8Array([1, 2, 3, 4]);
    const b64 = btoa(String.fromCharCode(...der));
    const pem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
    const blocks = await inspectPem(pem);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.label).toBe('CERTIFICATE');
    expect(blocks[0]?.derBytes).toBe(4);
    expect(blocks[0]?.sha256).toHaveLength(64);
    expect(formatPemInspection(blocks)).toContain('CERTIFICATE');
  });
});
