import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_COLLABORATION_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'teams-overview',
    groupId: 'collaboration',
    label: 'Team sync',
    icon: 'users',
    title: 'Team collaboration',
    description: 'Git-backed sync for team profiles while they are active.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Testrix Teams uses Git as transport—no Testrix cloud account required. Connect a Git remote, import or publish team profiles, then switch to a team profile to push and pull workspace data automatically.',
      },
      {
        type: 'list',
        items: [
          'Open Teams from the titlebar (between Cookies and Settings).',
          'Connect to a Git remote on the Overview tab.',
          'Import team profiles from the remote catalog, create a new team profile, or publish a local profile.',
          'Switch to a team profile in the titlebar — Git sync runs only while that profile is active.',
          'Configure per-profile share scope on the Team profiles tab.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'teams-branches',
    groupId: 'collaboration',
    label: 'Branches',
    icon: 'folder',
    title: 'Branches',
    description: 'Work on feature branches with your team.',
    blocks: [
      {
        type: 'list',
        items: [
          'Use the Branches tab in the Teams panel to list, create, and switch branches.',
          'Switching branches reloads workspace data from disk.',
          'Conflicts surface in the Teams panel — choose Use local or Use remote for conflicted files.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'teams-share-scope',
    groupId: 'collaboration',
    label: 'Share scope',
    icon: 'settings',
    title: 'What gets shared',
    description: 'Personal data stays local.',
    blocks: [
      {
        type: 'list',
        items: [
          'Shared: collections, environments, test suites, load tests, regressions, mock server (per team profile toggles).',
          'Set a default scope on Team profiles, or a custom scope per team profile.',
          'The team profile list is published in the Git repo (`team-profiles.json`) so teammates can import profiles.',
          'Local profiles never sync unless you publish them as team profiles.',
          'Session, history, and cookies always stay local.',
        ],
      },
    ],
  }),
];
