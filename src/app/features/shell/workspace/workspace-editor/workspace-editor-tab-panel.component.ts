import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  input,
  output,
} from '@angular/core';

/** Host wrapper that signals when a cached tab panel has finished its first paint. */
@Component({
  selector: 'app-workspace-editor-tab-panel',
  standalone: true,
  template: '<ng-content />',
  styles: `
    :host {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
      min-width: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceEditorTabPanelComponent {
  readonly tabId = input.required<string>();
  readonly ready = output<void>();

  private readyEmitted = false;

  constructor() {
    afterNextRender(() => {
      if (this.readyEmitted) {
        return;
      }
      this.readyEmitted = true;
      this.ready.emit();
    });
  }
}
