import type { CollectionRequestBody, HttpMethodId } from '@shared/config';
import { createHttpKeyValueRow } from '@shared/config';

export interface WelcomeTemplateRequest {
  readonly label: string;
  readonly method: HttpMethodId;
  readonly url: string;
  readonly body?: CollectionRequestBody;
  readonly headerRows?: readonly { readonly key: string; readonly value: string }[];
}

export interface WelcomeCollectionTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly folderLabel: string;
  readonly requests: readonly WelcomeTemplateRequest[];
}

/** Starter collections shown on the welcome screen. */
export const WELCOME_COLLECTION_TEMPLATES: readonly WelcomeCollectionTemplate[] = [
  {
    id: 'rest-crud',
    label: 'REST CRUD',
    description: 'List, create, read, update, and delete a resource',
    folderLabel: 'REST CRUD',
    requests: [
      { label: 'List items', method: 'GET', url: '{{baseUrl}}/items' },
      {
        label: 'Create item',
        method: 'POST',
        url: '{{baseUrl}}/items',
        body: { mode: 'json', raw: '{\n  "name": "New item"\n}' },
      },
      { label: 'Get item', method: 'GET', url: '{{baseUrl}}/items/{{itemId}}' },
      {
        label: 'Update item',
        method: 'PUT',
        url: '{{baseUrl}}/items/{{itemId}}',
        body: { mode: 'json', raw: '{\n  "name": "Updated"\n}' },
      },
      { label: 'Delete item', method: 'DELETE', url: '{{baseUrl}}/items/{{itemId}}' },
    ],
  },
  {
    id: 'oauth-api',
    label: 'OAuth API',
    description: 'Authorization-code authorize and token exchange',
    folderLabel: 'OAuth API',
    requests: [
      {
        label: 'Authorize',
        method: 'GET',
        url: '{{authUrl}}/authorize?response_type=code&client_id={{clientId}}&redirect_uri={{redirectUri}}',
      },
      {
        label: 'Exchange token',
        method: 'POST',
        url: '{{authUrl}}/token',
        headerRows: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
        body: {
          mode: 'x-www-form-urlencoded',
          fields: [
            createHttpKeyValueRow({ key: 'grant_type', value: 'authorization_code' }),
            createHttpKeyValueRow({ key: 'code', value: '{{authCode}}' }),
            createHttpKeyValueRow({ key: 'client_id', value: '{{clientId}}' }),
            createHttpKeyValueRow({ key: 'redirect_uri', value: '{{redirectUri}}' }),
          ],
        },
      },
    ],
  },
  {
    id: 'graphql',
    label: 'GraphQL',
    description: 'POST a GraphQL query with variables',
    folderLabel: 'GraphQL',
    requests: [
      {
        label: 'Query',
        method: 'POST',
        url: '{{baseUrl}}/graphql',
        body: {
          mode: 'graphql',
          query: 'query Health {\n  __typename\n}',
          variables: '{}',
        },
      },
    ],
  },
  {
    id: 'webhook-listener',
    label: 'Webhook listener',
    description: 'POST a sample webhook payload',
    folderLabel: 'Webhook',
    requests: [
      {
        label: 'Receive webhook',
        method: 'POST',
        url: '{{baseUrl}}/webhooks',
        body: { mode: 'json', raw: '{\n  "event": "ping",\n  "id": "{{$guid}}"\n}' },
      },
    ],
  },
];
