import { describe, expect, it } from 'vitest';
import {
  bookIdsFromHitsPayload,
  chunkIds,
  summarizeComparisonCounts
} from './countSummary';

describe('comparison count summary', () => {
  it('unions document ids across searches', () => {
    const summary = summarizeComparisonCounts([
      { term: 'x', total: 12, docs: 5, bookIds: [1, 2, 3, 4, 5] },
      { term: 'y', total: 7, docs: 3, bookIds: [4, 5, 6] }
    ]);
    expect(summary).toEqual({
      total: 19,
      uniqueDocs: 6,
      uniqueDocsSum: 8
    });
  });

  it('falls back to the per-search sum when no ids are available', () => {
    expect(summarizeComparisonCounts([
      { term: 'x', total: 12, docs: 5, bookIds: [] },
      { term: 'y', total: 7, docs: 3, bookIds: [] }
    ]).uniqueDocs).toBe(8);
  });

  it('reads unique book ids from a hits payload', () => {
    expect(bookIdsFromHitsPayload({
      rows: [{ bookId: 1 }, { bookId: 1 }, { bookId: 2 }, { bookId: Number.NaN }]
    })).toEqual([1, 2]);
  });

  it('splits ids into bounded chunks', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
