import { wikiSection } from '../help-wiki.builders';
import type { HelpWikiSection } from '../help-wiki.schema';

export const HELP_WIKI_ENVIRONMENTS_SECTIONS: readonly HelpWikiSection[] = [
  wikiSection({
    id: 'environments-overview',
    groupId: 'environments',
    label: 'Environments overview',
    icon: 'globe',
    title: 'Environments overview',
    description: 'Environment list, activation, and profile scope.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Environments are named variable sets scoped to the active profile. Activate one environment to resolve {{variables}} in requests, scripts, and tests.',
      },
      {
        type: 'list',
        items: [
          'Create environments from the Environments sidebar panel.',
          'Activate via the environment selector or by opening an environment tab.',
          'Each environment can contain nested variable scopes in its tree.',
        ],
      },
    ],
  }),
  wikiSection({
    id: 'environment-variables',
    groupId: 'environments',
    label: 'Variables',
    icon: 'hash',
    title: 'Environment variables',
    description: 'Key/value rows, descriptions, and tree navigation.',
    blocks: [
      {
        type: 'paragraph',
        text: 'Variables are key/value pairs with optional descriptions. Use the help icon on the Value field for hints about secrets and multiline values.',
      },
      {
        type: 'tip',
        text: 'Reference variables in URLs and bodies as {{variableName}} — resolution happens at send/run time.',
      },
    ],
  }),
];
