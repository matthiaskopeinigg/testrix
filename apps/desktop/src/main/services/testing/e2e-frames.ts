import type { BrowserWindow, WebFrameMain } from 'electron';

/** Every live frame in the page (main + iframes), or empty if unavailable. */
export function collectPageFrames(win: BrowserWindow): WebFrameMain[] {
  try {
    if (win.isDestroyed())
      return [];
    return win.webContents.mainFrame.framesInSubtree.filter((frame) => !frame.isDestroyed());
  } catch {
    return [];
  }
}

export function pageFrameKey(frame: WebFrameMain): string {
  return String(frame.frameTreeNodeId);
}

/**
 * Maps a point from a frame's viewport into top-level webContents coordinates
 * by walking parent iframe element offsets.
 */
export async function toTopLevelPoint(
  frame: WebFrameMain,
  local: { readonly x: number; readonly y: number },
): Promise<{ readonly x: number; readonly y: number }> {
  let x = local.x;
  let y = local.y;
  let current: WebFrameMain | null = frame;
  while (current?.parent && !current.parent.isDestroyed()) {
    const parent: WebFrameMain = current.parent;
    const childName = current.name || '';
    const childUrl = current.url || '';
    const offset = (await parent
      .executeJavaScript(
        `(() => {
      const frames = Array.from(document.querySelectorAll('iframe,frame'));
      if (!frames.length) return null;
      var el = null;
      var name = ${JSON.stringify(childName)};
      var url = ${JSON.stringify(childUrl)};
      if (name) {
        el = frames.find(function (f) {
          return (f.getAttribute('name') || f.name || '') === name;
        }) || null;
      }
      if (!el && url) {
        el = frames.find(function (f) {
          var src = f.getAttribute('src') || f.src || '';
          return src && (url === src || url.indexOf(src) === 0 || src.indexOf(url) === 0);
        }) || null;
      }
      if (!el && frames.length === 1) el = frames[0];
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    })()`,
      )
      .catch(() => null)) as { left: number; top: number } | null;
    if (!offset)
      break;
    x += offset.left;
    y += offset.top;
    current = parent;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Runs `script` in each frame until `isHit` accepts the result.
 */
export async function evalAcrossFrames<T>(
  win: BrowserWindow,
  script: string,
  isHit: (value: unknown) => value is T,
): Promise<T | null> {
  for (const frame of collectPageFrames(win)) {
    try {
      const value = await frame.executeJavaScript(script);
      if (isHit(value))
        return value;
    } catch {
      // Cross-origin / detached frames can reject; keep scanning.
    }
  }
  return null;
}
