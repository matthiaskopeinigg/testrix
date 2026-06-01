import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Resolves URLs for static files copied from Angular `public/` into the browser bundle.
 */
@Injectable({ providedIn: 'root' })
export class PublicAssetService {
  private readonly doc = inject(DOCUMENT);

  /**
   * @param relativeFromPublic Path under `public/` (with or without a leading slash).
   */
  url(relativeFromPublic: string): string {
    const bridge = typeof window !== 'undefined' ? window.testrix : undefined;
    if (bridge?.resolveStaticAssetUrl) {
      return bridge.resolveStaticAssetUrl(relativeFromPublic);
    }

    const clean = relativeFromPublic.replace(/^\/+/, '');
    return new URL(clean, this.doc.baseURI).href;
  }
}

/**
 * @param relativeFromPublic Path under `public/` (with or without a leading slash).
 */
export function publicAssetUrl(relativeFromPublic: string): string {
  const clean = relativeFromPublic.replace(/^\/+/, '');
  if (typeof window !== 'undefined' && window.testrix?.resolveStaticAssetUrl) {
    return window.testrix.resolveStaticAssetUrl(clean);
  }
  if (typeof document !== 'undefined') {
    return new URL(clean, document.baseURI).href;
  }
  return clean;
}
