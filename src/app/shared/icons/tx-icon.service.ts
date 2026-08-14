import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PublicAssetService } from '../assets/public-asset-url';
import { txIconRelativePath, type TxIconName } from './tx-icon.registry';

/**
 * Loads and caches inner SVG markup from `assets/icons` (`icons/*.svg`) for `tx-icon`.
 */
@Injectable({ providedIn: 'root' })
export class TxIconService {
  private readonly http = inject(HttpClient);
  private readonly assets = inject(PublicAssetService);

  private readonly cache = new Map<TxIconName, string>();
  private readonly inflight = new Map<TxIconName, Promise<string>>();

  /**
   * Returns cached inner SVG elements for the icon, fetching on first use.
   */
  loadIconInner(name: TxIconName): Promise<string> {
    const cached = this.cache.get(name);
    if (cached) {
      return Promise.resolve(cached);
    }

    const pending = this.inflight.get(name);
    if (pending) {
      return pending;
    }

    const request = firstValueFrom(
      this.http.get(this.assets.url(txIconRelativePath(name)), { responseType: 'text' }),
    )
      .then((svg) => {
        const inner = extractSvgInner(svg);
        this.cache.set(name, inner);
        this.inflight.delete(name);
        return inner;
      })
      .catch((err: unknown) => {
        this.inflight.delete(name);
        throw err;
      });

    this.inflight.set(name, request);
    return request;
  }
}

/** Strips the root `<svg>` wrapper and returns child markup for inline use. */
export function extractSvgInner(svgText: string): string {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;

  if (root.tagName.toLowerCase() !== 'svg') {
    throw new Error('Icon SVG must have a root <svg> element');
  }

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(parseError.textContent ?? 'Invalid icon SVG');
  }

  return Array.from(root.childNodes)
    .map((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as Element).outerHTML;
      }
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        return node.textContent.trim();
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}
