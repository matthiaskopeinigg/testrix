// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { sanitizeSvgMarkup } from './svg-sanitize';

describe('sanitizeSvgMarkup', () => {
  it('keeps ordinary diagram markup', () => {
    // Arrange
    const svg = '<svg viewBox="0 0 10 10"><g class="x"><rect width="4" height="4" fill="#fff"></rect><text x="1">Hi</text></g></svg>';

    // Act
    const clean = sanitizeSvgMarkup(svg);

    // Assert
    expect(clean).toContain('<rect');
    expect(clean).toContain('>Hi</text>');
  });

  it('removes scripts, foreignObject and animation that can rewrite links', () => {
    // Arrange
    const svg = '<svg><script>alert(1)</script><foreignObject><div>x</div></foreignObject><a><set attributeName="href" to="javascript:alert(1)"></set></a></svg>';

    // Act
    const clean = sanitizeSvgMarkup(svg).toLowerCase();

    // Assert
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('foreignobject');
    expect(clean).not.toContain('<set');
  });

  it('drops event handlers and script links but keeps web links', () => {
    // Arrange
    const svg = '<svg onload="alert(1)"><a href="javascript:alert(1)"><text>bad</text></a><a xlink:href=" JaVaScRiPt:alert(1)"></a><a href="https://example.com/docs"><text>ok</text></a><a href="#node-1"></a></svg>';

    // Act
    const clean = sanitizeSvgMarkup(svg);

    // Assert
    expect(clean).not.toMatch(/onload/i);
    expect(clean).not.toMatch(/javascript/i);
    expect(clean).toContain('href="https://example.com/docs"');
    expect(clean).toContain('href="#node-1"');
  });

  it('removes styles that reference script urls or imports', () => {
    // Arrange
    const svg = '<svg><style>@import url(https://evil.example/x.css);</style><rect style="fill:url(javascript:alert(1))"></rect><rect style="fill:red"></rect></svg>';

    // Act
    const clean = sanitizeSvgMarkup(svg);

    // Assert
    expect(clean).not.toContain('@import');
    expect(clean).not.toMatch(/javascript/i);
    expect(clean).toContain('style="fill:red"');
  });
});
