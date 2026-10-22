import { describe, expect, it } from 'vitest';
import { buildConcordanceCsv, buildCountCsv, escapeCsvCell, safeFilenamePart } from './csvExport';

describe('CSV export', () => {
  it('escapes quotes, commas and line breaks', () => {
    expect(escapeCsvCell('ord, "sitat"\nny linje')).toBe('"ord, ""sitat""\nny linje"');
  });

  it('writes a UTF-8 BOM, stable columns and CRLF rows', () => {
    const csv = buildConcordanceCsv([{
      dhlabid: 42,
      pos: 7,
      frag: 'før,treff,etter',
      urn: 'URN:NBN:no-nb_digibok_1',
      title: 'Tittel',
      author: 'Forfatter',
      year: 1890,
      category: 'Diverse'
    }]);

    expect(csv.startsWith('\uFEFFdhlabid,pos,frag,urn,title,author,year,category\r\n')).toBe(true);
    expect(csv).toContain('"før,treff,etter"');
  });

  it('creates a filesystem-safe query name', () => {
    expect(safeFilenamePart('"Norge i krig" / 1890')).toBe('norge-i-krig-1890');
  });

  it('writes count totals as CSV rows', () => {
    const csv = buildCountCsv([
      { query: 'demokrati', total: 120, docs: 40 },
      { query: 'spise, middag', total: 8, docs: 3 }
    ]);
    expect(csv.startsWith('\uFEFFquery,total,docs\r\n')).toBe(true);
    expect(csv).toContain('demokrati,120,40');
    expect(csv).toContain('"spise, middag",8,3');
  });
});
