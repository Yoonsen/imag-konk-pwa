import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_SEARCH_HISTORY,
  clearSearchHistory,
  formatSearchList,
  importSearchQueries,
  loadSearchHistory,
  matchingSearchHistory,
  parsePastedSearchList,
  rememberSearchQuery,
  removeSearchQuery
} from './searchHistory';

afterEach(() => {
  clearSearchHistory();
});

describe('search history', () => {
  it('stores unique queries with the newest first', () => {
    const first = rememberSearchQuery('demokrati', []);
    const second = rememberSearchQuery('frihet', first);
    const again = rememberSearchQuery('demokrati', second);

    expect(again).toEqual(['demokrati', 'frihet']);
    expect(loadSearchHistory()).toEqual(['demokrati', 'frihet']);
  });

  it('caps the list and ignores debug commands', () => {
    const filled = Array.from({ length: MAX_SEARCH_HISTORY }, (_, index) => `ord${index}`);
    const next = rememberSearchQuery('nytt', filled);
    expect(next).toHaveLength(MAX_SEARCH_HISTORY);
    expect(next[0]).toBe('nytt');
    expect(next).not.toContain(`ord${MAX_SEARCH_HISTORY - 1}`);
    expect(rememberSearchQuery(':debug on', next)).toEqual(next);
  });

  it('filters suggestions by the typed query', () => {
    const history = ['demokratiet', 'demokrati', 'frihet'];
    expect(matchingSearchHistory(history, '')).toEqual(history);
    expect(matchingSearchHistory(history, 'demo')).toEqual(['demokratiet', 'demokrati']);
    expect(matchingSearchHistory(history, 'demokrati')).toEqual(['demokratiet', 'demokrati']);
  });

  it('parses a pasted list while keeping multiline JSON as one query', () => {
    expect(parsePastedSearchList('demokrati\nfrihet\n\nnorge')).toEqual([
      'demokrati',
      'frihet',
      'norge'
    ]);
    expect(parsePastedSearchList('[\n["spise","spiser"],\n["middag"]\n]')).toEqual([
      '[ ["spise","spiser"], ["middag"] ]'
    ]);
  });

  it('imports pasted queries ahead of existing ones', () => {
    const next = importSearchQueries(['norge', 'frihet'], ['demokrati', 'frihet']);
    expect(next).toEqual(['norge', 'frihet', 'demokrati']);
    expect(formatSearchList(next)).toBe('norge\nfrihet\ndemokrati');
  });

  it('removes a single query from the persisted list', () => {
    const history = rememberSearchQuery('frihet', rememberSearchQuery('norge', []));
    expect(removeSearchQuery('norge', history)).toEqual(['frihet']);
    expect(loadSearchHistory()).toEqual(['frihet']);
  });

  it('clears persisted history', () => {
    rememberSearchQuery('norge', []);
    expect(clearSearchHistory()).toEqual([]);
    expect(loadSearchHistory()).toEqual([]);
  });
});
