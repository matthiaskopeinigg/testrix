import { describe, expect, it } from 'vitest';

import { resolveFlowText } from './flow-eval';

describe('resolveFlowText', () => {
  const random = () => 0.42;

  it('substitutes environment variables and leaves the token out of the result', () => {
    expect(resolveFlowText('#user-{{id}}', { id: '42' })).toBe('#user-42');
    expect(resolveFlowText('{{baseUrl}}/login', { baseUrl: 'https://api.example' })).toBe(
      'https://api.example/login',
    );
  });

  it('expands $randomEmail and %randomEmail into an address', () => {
    expect(resolveFlowText('$randomEmail', {}, { random, emailDomain: 'test.at' })).toBe('pppppppp@test.at');
    expect(resolveFlowText('%randomEmail', {}, { random, emailDomain: 'test.at' })).toBe('pppppppp@test.at');
    expect(resolveFlowText('%randomEmail(other.at)', {}, { random, emailDomain: 'test.at' })).toBe(
      'pppppppp@other.at',
    );
  });

  it('expands a placeholder stored as an environment value', () => {
    expect(resolveFlowText('{{mail}}', { mail: '$randomEmail' }, { random, emailDomain: 'test.at' })).toBe(
      'pppppppp@test.at',
    );
  });

  it('leaves percent-encoding and unknown tokens alone', () => {
    expect(resolveFlowText('a%20b $notAToken %notAToken', {})).toBe('a%20b $notAToken %notAToken');
  });
});
