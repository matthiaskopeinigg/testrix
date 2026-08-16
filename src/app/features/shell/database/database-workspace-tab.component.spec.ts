import { TestBed } from '@angular/core/testing';

import { DatabaseWorkspaceTabComponent } from './database-workspace-tab.component';

describe('DatabaseWorkspaceTabComponent', () => {
  it('compiles the query tab template', async () => {
    await TestBed.configureTestingModule({
      imports: [DatabaseWorkspaceTabComponent],
    }).compileComponents();
    expect(DatabaseWorkspaceTabComponent).toBeTruthy();
  });
});
