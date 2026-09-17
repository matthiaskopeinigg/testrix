import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DatabaseQueryActionsService {
  private readonly runner = signal<(() => void) | null>(null);

  register(run: () => void): () => void {
    this.runner.set(run);
    return () => {
      if (this.runner() === run)
        this.runner.set(null);
    };
  }

  run(): void {
    this.runner()?.();
  }

  hasRunner(): boolean {
    return this.runner() !== null;
  }
}
