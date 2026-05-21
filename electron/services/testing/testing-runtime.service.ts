/**
 * In-process stubs for mock server, capture, interceptor, and load-test runtimes.
 * Replace with real engines as verticals mature.
 */
export class TestingRuntimeService {
  private mockRunning = false;
  private captureRunning = false;
  private interceptorRunning = false;
  private loadRunning = false;
  private readonly captureEntries: { readonly id: string; readonly method: string; readonly url: string; readonly at: string }[] =
    [];

  mockStatus(): { readonly running: boolean } {
    return { running: this.mockRunning };
  }

  mockStart(): { readonly running: boolean } {
    this.mockRunning = true;
    return { running: true };
  }

  mockStop(): { readonly running: boolean } {
    this.mockRunning = false;
    return { running: false };
  }

  captureStatus(): { readonly running: boolean } {
    return { running: this.captureRunning };
  }

  captureStart(): { readonly running: boolean } {
    this.captureRunning = true;
    return { running: true };
  }

  captureStop(): { readonly running: boolean } {
    this.captureRunning = false;
    return { running: false };
  }

  captureListEntries(): readonly { readonly id: string; readonly method: string; readonly url: string; readonly at: string }[] {
    return this.captureEntries;
  }

  interceptorStatus(): { readonly running: boolean } {
    return { running: this.interceptorRunning };
  }

  interceptorStart(): { readonly running: boolean } {
    this.interceptorRunning = true;
    return { running: true };
  }

  interceptorStop(): { readonly running: boolean } {
    this.interceptorRunning = false;
    return { running: false };
  }

  loadTestStatus(): { readonly running: boolean } {
    return { running: this.loadRunning };
  }

  loadTestStart(): { readonly running: boolean } {
    this.loadRunning = true;
    return { running: true };
  }

  loadTestCancel(): { readonly running: boolean } {
    this.loadRunning = false;
    return { running: false };
  }

  async e2eExecuteFlow(_flowId: string): Promise<{ readonly ok: boolean; readonly message: string }> {
    return { ok: true, message: 'Flow execution stub completed.' };
  }

  e2eCancel(): void {
    // no-op stub
  }
}
