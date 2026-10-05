const BLOCKED_ELEMENTS = [
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'set',
  'animate',
  'handler',
  'listener',
] as const;

const LINK_ATTRIBUTES = ['href', 'xlink:href', 'src', 'action', 'formaction'] as const;

const SAFE_LINK = /^(#|https?:|mailto:|data:image\/(png|jpe?g|gif|webp);)/i;

/**
 * Strips script-capable content from renderer-generated SVG markup before it is
 * placed in the DOM: script-like elements, event handler attributes, and links
 * that are not in-page anchors, http(s), mailto, or raster data images.
 */
export function sanitizeSvgMarkup(markup: string): string {
  const doc = new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html');
  const root = doc.body;
  root.querySelectorAll('*').forEach((node) => {
    if ((BLOCKED_ELEMENTS as readonly string[]).includes(node.localName.toLowerCase()))
      node.remove();
  });
  root.querySelectorAll('*').forEach(sanitizeElement);
  root.querySelectorAll('style').forEach((node) => {
    if (hasScriptUrl(node.textContent ?? '') || /@import/i.test(node.textContent ?? ''))
      node.remove();
  });
  return root.innerHTML;
}

function sanitizeElement(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if ((LINK_ATTRIBUTES as readonly string[]).includes(name) && !SAFE_LINK.test(attribute.value.trim())) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === 'style' && hasScriptUrl(attribute.value))
      element.removeAttribute(attribute.name);
  }
}

function hasScriptUrl(value: string): boolean {
  return /(javascript|vbscript):|data:text\/html/i.test(value.replace(/\s+/g, ''));
}
