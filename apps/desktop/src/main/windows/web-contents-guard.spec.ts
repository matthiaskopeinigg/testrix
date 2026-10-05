import type { Session, WebContents } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openExternal = vi.fn(() => Promise.resolve());

vi.mock('electron', () => ({ shell: { openExternal } }));

const { guardWorkbenchContents, installWorkbenchPermissions, isWorkbenchPermission } = await import('./web-contents-guard');

type Listener = (event: { preventDefault: () => void }, url?: string) => void;

function fakeContents() {
  const listeners = new Map<string, Listener>();
  let openHandler: ((details: { url: string }) => { action: string }) | null = null;
  const contents = {
    setWindowOpenHandler: (handler: typeof openHandler) => void (openHandler = handler),
    on: (name: string, listener: Listener) => void listeners.set(name, listener),
  } as unknown as WebContents;
  const fire = (name: string, url?: string) => {
    const event = { preventDefault: vi.fn() };
    listeners.get(name)!(event, url);
    return event;
  };
  return { contents, fire, open: (url: string) => openHandler!({ url }) };
}

describe('guardWorkbenchContents', () => {
  beforeEach(() => openExternal.mockClear());

  it('denies popups and sends web links to the system browser', () => {
    // Arrange
    const { contents, open } = fakeContents();
    guardWorkbenchContents(contents);

    // Act
    const web = open('https://example.com/docs');
    const local = open('file:///C:/Windows/System32/calc.exe');

    // Assert
    expect(web.action).toBe('deny');
    expect(local.action).toBe('deny');
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('blocks every top-level navigation', () => {
    // Arrange
    const { contents, fire } = fakeContents();
    guardWorkbenchContents(contents);

    // Act
    const dropped = fire('will-navigate', 'file:///C:/Users/me/secret.json');
    const web = fire('will-navigate', 'https://evil.example/');

    // Assert
    expect(dropped.preventDefault).toHaveBeenCalled();
    expect(web.preventDefault).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://evil.example/');
  });

  it('refuses to attach a webview', () => {
    // Arrange
    const { contents, fire } = fakeContents();
    guardWorkbenchContents(contents);

    // Act
    const event = fire('will-attach-webview');

    // Assert
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

describe('workbench permissions', () => {
  it('allows only clipboard and fullscreen for the app itself', () => {
    // Act
    const clipboard = isWorkbenchPermission('clipboard-sanitized-write', 'file:///app/index.html');
    const camera = isWorkbenchPermission('media', 'file:///app/index.html');
    const foreign = isWorkbenchPermission('clipboard-read', 'https://evil.example/');

    // Assert
    expect(clipboard).toBe(true);
    expect(camera).toBe(false);
    expect(foreign).toBe(false);
  });

  it('answers permission requests through the allowlist', () => {
    // Arrange
    let requestHandler: ((...args: unknown[]) => void) | null = null;
    const session = {
      setPermissionRequestHandler: (handler: typeof requestHandler) => void (requestHandler = handler),
      setPermissionCheckHandler: vi.fn(),
    } as unknown as Session;
    installWorkbenchPermissions(session);
    const callback = vi.fn();

    // Act
    requestHandler!(null, 'geolocation', callback, { requestingUrl: 'file:///app/index.html' });

    // Assert
    expect(callback).toHaveBeenCalledWith(false);
  });
});
