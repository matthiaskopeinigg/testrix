import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_HISTORY_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'history',
    groupId: 'history',
    label: 'History',
    icon: 'clock',
    title: 'History',
    description: 'Request log, filters, and reopening entries.',
    blocks: [
      {
        type: 'paragraph',
        text: 'History records sent HTTP requests with method, URL, status, and timing. Open an entry to inspect or re-send from a history workspace tab.',
      },
      {
        type: 'list',
        items: [
          'Filter and sort from the History sidebar toolbar.',
          'Mock server hits and capture traffic may also append history when configured.',
          'History is stored per profile in the session/history files on disk.',
        ],
      },
    ],
  }),
];
