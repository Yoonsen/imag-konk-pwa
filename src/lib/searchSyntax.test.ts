import { describe, expect, it } from 'vitest';
import { parseComparisonExpressions, parseTermGroups } from './searchSyntax';

describe('search syntax', () => {
  it('keeps square brackets as an OR group in one query', () => {
    expect(parseTermGroups('[x, y] z')).toEqual([['x', 'y'], ['z']]);
    expect(parseComparisonExpressions('[x, y] z')).toBeNull();
  });

  it('parses complete comparison expressions separated by semicolons', () => {
    expect(parseComparisonExpressions('{x z; y z}')).toEqual([
      { label: 'x z', termGroups: [['x'], ['z']], matchMode: 'near' },
      { label: 'y z', termGroups: [['y'], ['z']], matchMode: 'near' }
    ]);
  });

  it('allows OR groups inside each compared expression', () => {
    expect(parseComparisonExpressions('{[x,y] z; [a,b] z}')).toEqual([
      { label: '[x,y] z', termGroups: [['x', 'y'], ['z']], matchMode: 'near' },
      { label: '[a,b] z', termGroups: [['a', 'b'], ['z']], matchMode: 'near' }
    ]);
  });

  it('requires braces, semicolons and balanced groups', () => {
    expect(() => parseComparisonExpressions('{x z}')).toThrow(/minst to søk/);
    expect(() => parseComparisonExpressions('{[x,y z; a z}')).toThrow(/hakeparenteser/);
    expect(() => parseComparisonExpressions('{x z; y z')).toThrow(/omsluttes/);
  });
});
