/** Short-lived uiautomator dump cache keyed by adb serial. */
export class DeviceHierarchyCache {
  private readonly entries = new Map<string, { readonly xml: string; readonly at: number }>();

  constructor(private readonly ttlMs = 400) {}

  get(serial: string): string | null {
    const hit = this.entries.get(serial);
    if (!hit)
      return null;
    if (Date.now() - hit.at > this.ttlMs) {
      this.entries.delete(serial);
      return null;
    }
    return hit.xml;
  }

  set(serial: string, xml: string): void {
    this.entries.set(serial, { xml, at: Date.now() });
  }

  invalidate(serial: string): void {
    this.entries.delete(serial);
  }

  clear(): void {
    this.entries.clear();
  }
}
