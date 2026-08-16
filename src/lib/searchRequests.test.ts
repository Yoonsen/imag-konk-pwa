import { describe, expect, it } from 'vitest';
import {
  FULL_EXPORT_LIMIT,
  PREVIEW_PROFILES,
  buildCountRequest,
  buildFullExportRequest,
  isExportWithinLimit,
  isObviouslyBroadExportQuery,
  matchingPreviewProfile,
  normalizeSearchParameters
} from './searchRequests';

const baseContext = {
  terms: null,
  termGroups: [['demokrati']],
  useFilter: true,
  filterIds: [11, 22],
  nearWindow: 5,
  beforeWindow: 15,
  afterWindow: 15,
  maxVariants: 10,
  symmetric: true,
  matchMode: 'near' as const
};

describe('search request profiles', () => {
  it('defines the balanced profile from the default preview values', () => {
    expect(PREVIEW_PROFILES.find((profile) => profile.id === 'balanced')).toMatchObject({
      perBook: 3,
      docSamples: 50,
      totalLimit: 200
    });
  });

  it('recognizes profiles while allowing custom combinations', () => {
    expect(matchingPreviewProfile(2, 25, 80)).toBe('quick');
    expect(matchingPreviewProfile(3, 50, 200)).toBe('balanced');
    expect(matchingPreviewProfile(5, 200, 600)).toBe('larger');
    expect(matchingPreviewProfile(4, 50, 200)).toBeNull();
  });

  it('keeps sampling limits for concordance previews', () => {
    expect(normalizeSearchParameters({
      resultMode: 'render',
      perBook: 3,
      docSamples: 50,
      totalLimit: 200,
      nearWindow: 5,
      beforeWindow: 15,
      afterWindow: 15,
      maxVariants: 10
    })).toMatchObject({ perBook: 3, docSamples: 50, totalLimit: 200 });
  });

  it('uses the complete active subcorpus for aggregate modes', () => {
    expect(normalizeSearchParameters({
      resultMode: 'count',
      perBook: 3,
      docSamples: 50,
      totalLimit: 200,
      nearWindow: 5,
      beforeWindow: 15,
      afterWindow: 15,
      maxVariants: 10
    })).toMatchObject({ perBook: 0, docSamples: 0, totalLimit: 0 });
  });

  it('preserves filters in count and export requests', () => {
    const count = buildCountRequest(baseContext);
    const exportRequest = buildFullExportRequest(baseContext);
    expect(count.body).toMatchObject({ useFilter: true, filterIds: [11, 22] });
    expect(exportRequest.body).toMatchObject({ useFilter: true, filterIds: [11, 22] });
  });

  it('always caps a full export request at 5,000 rows', () => {
    const request = buildFullExportRequest(baseContext);
    expect(request.endpoint).toBe('or_query');
    expect(request.body).toMatchObject({
      perBook: 0,
      docSamples: 0,
      totalLimit: FULL_EXPORT_LIMIT
    });
    expect(isExportWithinLimit(FULL_EXPORT_LIMIT)).toBe(true);
    expect(isExportWithinLimit(FULL_EXPORT_LIMIT + 1)).toBe(false);
  });

  it('rejects obviously corpus-wide punctuation exports before preflight', () => {
    expect(isObviouslyBroadExportQuery('.')).toBe(true);
    expect(isObviouslyBroadExportQuery('*')).toBe(true);
    expect(isObviouslyBroadExportQuery('demokrati')).toBe(false);
  });
});
