/** Shared in-flight guard so panel opens do not repeat disk/IPC hydration. */
export function runTestingHydrateOnce(
  isLoaded: () => boolean,
  inflight: { current: Promise<void> | null },
  load: () => Promise<void>,
): Promise<void> {
  if (isLoaded()) {
    return Promise.resolve();
  }
  if (inflight.current) {
    return inflight.current;
  }
  const promise = load().finally(() => {
    if (inflight.current === promise) {
      inflight.current = null;
    }
  });
  inflight.current = promise;
  return promise;
}
