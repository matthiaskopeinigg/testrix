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
          'Switch to a team profile in the titlebar — Git sync runs only while that profile is active. Switching to a local profile pauses sync until you activate a team profile again.',
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
          'Create branch starts from master (or main) and keeps your current team profile files on the new branch, then pushes it.',
          'Switching branches reloads workspace data from disk.',
          'Conflicts surface in the Teams panel with a per-file diff. Choose Use local file or Use remote file, or Entity merge for collections.json and environments.json (nodes by id). Use local (all) / Use remote (all) still resolve every file at once.',
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
          'Shared: collections, environments (keys and non-secret values), saved queries, database connections (hosts and folders, never passwords), test suites, load tests, regressions, mock server (per team profile toggles).',
          'Secret environment values stay in each machine’s local vault (`vault.bin`) and are never pushed. Database connection passwords stay on each machine.',
          'Testrix scans staged JSON before push and blocks private keys, AWS keys, and inline secret values.',
          'Set a default scope on Team profiles, or a custom scope per team profile.',
          'The team profile list is published in the Git repo (`team-profiles.json`) so teammates can import profiles.',
          'Local profiles never sync unless you publish them as team profiles. A matching id in the team catalog does not convert a local profile automatically.',
          'Session, history, and cookies always stay local.',
        ],
      },
    ],
  }),
];
