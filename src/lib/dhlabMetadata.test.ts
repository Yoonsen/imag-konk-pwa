import { describe, expect, it } from 'vitest';
import { normalizeUrn, parseDhlabMetadataResponse } from './dhlabMetadata';

describe('DHlab metadata', () => {
  it('normalizes plain URNs and URN URLs', () => {
    expect(normalizeUrn(' URN:NBN:no-nb_digibok_1 ')).toBe('urn:nbn:no-nb_digibok_1');
    expect(normalizeUrn('https://urn.nb.no/URN:NBN:no-nb_digibok_2?x=1'))
      .toBe('urn:nbn:no-nb_digibok_2');
  });

  it('converts the column-oriented API response to metadata rows', () => {
    expect(parseDhlabMetadataResponse({
      dhlabid: { 0: 100048781 },
      urn: { 0: 'URN:NBN:no-nb_digibok_2011051604088' },
      title: { 0: 'Digte og noveller' },
      authors: { 0: 'Bull, Olaf' },
      year: { 0: 1916 },
      literaryform: { 0: 'Uklassifisert' }
    })).toEqual([{
      dhlabid: 100048781,
      urn: 'URN:NBN:no-nb_digibok_2011051604088',
      title: 'Digte og noveller',
      author: 'Bull, Olaf',
      year: 1916,
      category: 'Uklassifisert'
    }]);
  });

  it('ignores response rows without a numeric dhlabid', () => {
    expect(parseDhlabMetadataResponse({
      dhlabid: { 0: null },
      urn: { 0: 'URN:NBN:missing' }
    })).toEqual([]);
  });
});
