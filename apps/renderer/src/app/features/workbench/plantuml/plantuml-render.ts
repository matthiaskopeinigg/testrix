/** Lazy offline PlantUML renderer backed by bundled `@plantuml/core` assets. */

export interface PlantumlRenderResult {
  readonly svg: string | null;
  readonly error: string | null;
}

interface PlantumlApi {
  render(lines: string[], targetId: string, options?: { dark?: boolean }): void;
  renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: string) => void,
  ): void;
}

let apiPromise: Promise<PlantumlApi> | null = null;
let queue: Promise<void> = Promise.resolve();
let hostSeq = 0;

function assetUrl(file: string): string {
  return new URL(`assets/plantuml/${file}`, document.baseURI).href;
}

function loadClassicScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-tx-plantuml="${src}"]`);
  if (existing) {
    if (existing.dataset['loaded'] === '1')
      return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset['txPlantuml'] = src;
    script.addEventListener(
      'load',
      () => {
        script.dataset['loaded'] = '1';
        resolve();
      },
      { once: true },
    );
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.append(script);
  });
}

async function loadApi(): Promise<PlantumlApi> {
  if (!apiPromise) {
    apiPromise = (async () => {
      await loadClassicScript(assetUrl('viz-global.js'));
      const url = assetUrl('plantuml.js');
      const mod = (await import(/* @vite-ignore */ url)) as PlantumlApi;
      if (typeof mod.render !== 'function')
        throw new Error('PlantUML engine did not export render()');
      return mod;
    })().catch((error) => {
      apiPromise = null;
      throw error;
    });
  }
  return apiPromise;
}

function waitForSvg(host: HTMLElement, timeoutMs = 30_000): Promise<string> {
  const existing = host.querySelector('svg');
  if (existing)
    return Promise.resolve(host.innerHTML);

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('PlantUML render timed out'));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      if (!host.querySelector('svg'))
        return;
      window.clearTimeout(timer);
      observer.disconnect();
      resolve(host.innerHTML);
    });
    observer.observe(host, { childList: true, subtree: true });
  });
}

function isPlantumlCrashSvg(svg: string): boolean {
  const lower = svg.toLowerCase();
  return (
    lower.includes('has crashed')
    || lower.includes('webassembly.instantiate')
    || lower.includes('dot/graphviz has crashed')
    || lower.includes('compiling or instantiating webassembly')
  );
}

function crashMessageFromSvg(svg: string): string {
  if (svg.toLowerCase().includes('webassembly'))
    return 'GraphViz WebAssembly is blocked. Restart the app after the CSP update, or reload the window.';
  return 'PlantUML could not render this diagram.';
}

/**
 * Render PlantUML source to an SVG string. Calls are serialized because the
 * TeaVM engine shares internal state across renders.
 */
export function renderPlantumlSvg(source: string, dark = true): Promise<PlantumlRenderResult> {
  const run = async (): Promise<PlantumlRenderResult> => {
    try {
      const api = await loadApi();
      const lines = source.replace(/\r\n/g, '\n').split('\n');
      const id = `tx-plantuml-host-${++hostSeq}`;
      const host = document.createElement('div');
      host.id = id;
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
      document.body.append(host);

      try {
        api.render(lines, id, { dark });
        const svg = await waitForSvg(host);
        if (isPlantumlCrashSvg(svg))
          return { svg: null, error: crashMessageFromSvg(svg) };
        return { svg, error: null };
      } finally {
        host.remove();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PlantUML render failed';
      return { svg: null, error: message };
    }
  };

  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
