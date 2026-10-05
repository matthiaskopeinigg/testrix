import { describe, expect, it } from 'vitest';

import { hintForVariableOrigin, originForName, placeholderActivateFromDataset, placeholderOpenHint, shouldOpenPlaceholderOrigin, winningVariableOrigins } from './placeholder-origin';

describe('winningVariableOrigins', () => {
  it('lets the nearest folder overlay the environment', () => {
    const origins = winningVariableOrigins({
      folders: [
        {
          id: 'root',
          name: 'Root',
          variables: [{ id: '1', enabled: true, key: 'HOST', value: 'root', description: '' }],
        },
        {
          id: 'leaf',
          name: 'API',
          variables: [{ id: '2', enabled: true, key: 'HOST', value: 'leaf', description: '' }],
        },
      ],
      environment: {
        id: 'env-local',
        name: 'Local',
        variables: [
          {
            kind: 'variable',
            id: 'e1',
            key: 'HOST',
            value: 'env',
            description: '',
            enabled: true,
            secret: false,
          },
          {
            kind: 'variable',
            id: 'e2',
            key: 'TOKEN',
            value: 't',
            description: '',
            enabled: true,
            secret: false,
          },
        ],
      },
    });
    expect(originForName(origins, 'HOST')).toEqual({
      name: 'HOST',
      kind: 'folder',
      sourceId: 'leaf',
      sourceName: 'API',
    });
    expect(originForName(origins, 'TOKEN')).toEqual({
      name: 'TOKEN',
      kind: 'environment',
      sourceId: 'env-local',
      sourceName: 'Local',
    });
    expect(hintForVariableOrigin(originForName(origins, 'HOST'))).toBe('Folder · API');
    expect(hintForVariableOrigin(originForName(origins, 'TOKEN'))).toBe('Environment · Local');
  });

  it('skips disabled folder rows', () => {
    const origins = winningVariableOrigins({
      folders: [
        {
          id: 'folder',
          name: 'API',
          variables: [{ id: '1', enabled: false, key: 'HOST', value: 'off', description: '' }],
        },
      ],
      environment: {
        id: 'env-local',
        name: 'Local',
        variables: [
          {
            kind: 'variable',
            id: 'e1',
            key: 'HOST',
            value: 'env',
            description: '',
            enabled: true,
            secret: false,
          },
        ],
      },
    });
    expect(originForName(origins, 'HOST')?.kind).toBe('environment');
  });
});

describe('placeholderActivateFromDataset', () => {
  it('reads clickable chip attributes', () => {
    const attrs: Record<string, string> = {
      'data-tx-ph-kind': 'folder',
      'data-tx-ph-id': 'leaf',
      'data-tx-ph-name': 'API',
      'data-tx-ph-key': 'HOST',
    };
    const node = { getAttribute: (name: string) => attrs[name] ?? null } as Element;
    expect(placeholderActivateFromDataset(node)).toEqual({
      kind: 'folder',
      name: 'HOST',
      sourceId: 'leaf',
      sourceName: 'API',
    });
  });
});

describe('shouldOpenPlaceholderOrigin', () => {
  it('requires Shift+left-click', () => {
    expect(shouldOpenPlaceholderOrigin({ shiftKey: true, button: 0 } as MouseEvent)).toBe(true);
    expect(shouldOpenPlaceholderOrigin({ shiftKey: false, button: 0 } as MouseEvent)).toBe(false);
    expect(shouldOpenPlaceholderOrigin({ shiftKey: true, button: 2 } as MouseEvent)).toBe(false);
  });
});

describe('placeholderOpenHint', () => {
  it('appends the Shift+click cue', () => {
    expect(placeholderOpenHint('Environment · Prod')).toBe('Environment · Prod · Shift+click to open');
  });
});
