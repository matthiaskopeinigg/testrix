/** Search field copy for standard workspace sidebar panels. */
export interface WorkspaceSidebarPanelSearch {
  readonly placeholder: string;
  readonly ariaLabel: string;
}

const PANEL_SEARCH: Record<string, WorkspaceSidebarPanelSearch> = {
  collections: {
    placeholder: 'Search…',
    ariaLabel: 'Search collections',
  },
  environments: {
    placeholder: 'Search…',
    ariaLabel: 'Search environments',
  },
  testing: {
    placeholder: 'Search…',
    ariaLabel: 'Search tests',
  },
  development: {
    placeholder: 'Search…',
    ariaLabel: 'Search development tools',
  },
  history: {
    placeholder: 'Search…',
    ariaLabel: 'Search history',
  },
  debug: {
    placeholder: 'Search…',
    ariaLabel: 'Filter design system sections',
  },
};

/**
 * Returns search labels for a workspace sidebar panel id.
 */
export function workspaceSidebarPanelSearch(panelId: string): WorkspaceSidebarPanelSearch {
  return (
    PANEL_SEARCH[panelId] ?? {
      placeholder: 'Search…',
      ariaLabel: 'Search panel',
    }
  );
}
