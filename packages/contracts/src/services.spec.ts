import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SERVICES,
  defaultServiceSection,
  isServiceId,
  SERVICE_IDS,
  serviceById,
  serviceGroups,
} from './services';

describe('isServiceId', () => {
  it('accepts catalog ids', () => {
    expect(isServiceId('regression')).toBe(true);
    expect(isServiceId('flows')).toBe(true);
    expect(isServiceId('emulator')).toBe(true);
    expect(isServiceId('load')).toBe(true);
    expect(isServiceId('mocks')).toBe(true);
    expect(isServiceId('listeners')).toBe(true);
    expect(isServiceId('intercept')).toBe(true);
    expect(isServiceId('monitors')).toBe(false);
    expect(isServiceId('lookups')).toBe(false);
    expect(isServiceId('uuid-generator')).toBe(false);
  });
});

describe('SERVICE_IDS', () => {
  it('lists every catalog id', () => {
    expect(SERVICE_IDS).toEqual(DEFAULT_SERVICES.map((item) => item.id));
  });
});

describe('serviceById', () => {
  it('returns the catalog row', () => {
    expect(serviceById('flows')?.label).toBe('Flows');
    expect(serviceById('missing')).toBeNull();
  });
});

describe('serviceGroups', () => {
  it('splits scenarios and traffic', () => {
    expect(serviceGroups().map((item) => item.group.id)).toEqual(['scenarios', 'traffic']);
    expect(serviceGroups().map((item) => item.group.label)).toEqual(['Scenarios', 'Traffic']);
    expect(serviceGroups().flatMap((item) => item.items.map((service) => service.id))).toEqual([
      ...SERVICE_IDS,
    ]);
    expect(serviceGroups()[0]?.items.map((item) => item.id)).toEqual([
      'regression',
      'flows',
      'emulator',
      'load',
    ]);
    expect(serviceGroups()[1]?.items.map((item) => item.id)).toEqual([
      'mocks',
      'listeners',
      'intercept',
    ]);
  });
});

describe('defaultServiceSection', () => {
  it('opens flows on design', () => {
    expect(defaultServiceSection('flow')).toBe('design');
    expect(defaultServiceSection('load')).toBe('overview');
  });
});
