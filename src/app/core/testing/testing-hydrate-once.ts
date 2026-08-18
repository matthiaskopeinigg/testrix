/** Options for workspace hydrate after a profile switch or import. */
export interface TestingHydrateOptions {
  /** When true, reload from disk even if this service already hydrated. */
  readonly force?: boolean;
}

/** Shared in-flight guard so panel opens do not repeat disk/IPC hydration. */
export function runTestingHydrateOnce(
  isLoaded: () => boolean,
  inflight: { current: Promise<void> | null },
  load: () => Promise<void>,
  options?: TestingHydrateOptions,
): Promise<void> {
  if (!options?.force && isLoaded()) {
    return Promise.resolve();
  }
  if (inflight.current) {
    if (!options?.force) {
      return inflight.current;
    }
    return inflight.current.then(() => runTestingHydrateOnce(isLoaded, inflight, load, options));
  }
  const promise = load().finally(() => {
    if (inflight.current === promise) {
      inflight.current = null;
    }
  });
  inflight.current = promise;
  return promise;
}
