import { describe, expect, it } from 'vitest';
import {
  formatTrendValue,
  relativeFrequencyUnit,
  scaleComparisonTrendSeries,
  scaleSingleTrendRows,
  smoothComparisonTrendSeries,
  smoothSingleTrendRows
} from './trendScaling';

describe('trend scaling', () => {
  it('normalizes yearly hits per million tokens', () => {
    expect(scaleSingleTrendRows(
      [{ year: 1880, total: 250 }, { year: 1881, total: 10 }],
      'relative',
      { '1880': 1_000_000 }
    )).toEqual([{ year: 1880, total: 250 }]);
  });

  it('calculates cohort shares from all compared series', () => {
    const scaled = scaleComparisonTrendSeries([
      { term: 'spise', rows: [{ year: 1880, total: 30 }, { year: 1881, total: 0 }] },
      { term: 'sove', rows: [{ year: 1880, total: 70 }, { year: 1881, total: 0 }] }
    ], 'cohort', {});

    expect(scaled[0].rows).toEqual([{ year: 1880, total: 30 }]);
    expect(scaled[1].rows).toEqual([{ year: 1880, total: 70 }]);
  });

  it('formats each display mode distinctly', () => {
    expect(formatTrendValue(1234.4, 'absolute')).toBe('1 234');
    expect(formatTrendValue(12.345, 'relative')).toBe('12,35 ppm');
    expect(formatTrendValue(25_000, 'relative', 'percent')).toBe('2,5 %');
    expect(formatTrendValue(33.33, 'cohort')).toBe('33,3 %');
  });

  it('uses percent only for high-frequency relative series', () => {
    expect(relativeFrequencyUnit([20, 500, 9_999])).toBe('ppm');
    expect(relativeFrequencyUnit([20, 10_000])).toBe('percent');
  });

  it('uses a centered five-year average for absolute counts', () => {
    const rows = [1880, 1881, 1882, 1883, 1884].map((year, index) => ({
      year,
      total: (index + 1) * 10
    }));
    expect(smoothSingleTrendRows(rows, 'absolute', {})[2].total).toBe(30);
  });

  it('weights relative smoothing by token volume', () => {
    const rows = [{ year: 1880, total: 10 }, { year: 1881, total: 90 }];
    const smoothed = smoothSingleTrendRows(rows, 'relative', {
      '1880': 100,
      '1881': 900
    });
    expect(smoothed[0].total).toBe(100_000);
  });

  it('uses the full rolling cohort as denominator', () => {
    const smoothed = smoothComparisonTrendSeries([
      { term: 'a', rows: [{ year: 1880, total: 20 }, { year: 1881, total: 40 }] },
      { term: 'b', rows: [{ year: 1880, total: 80 }, { year: 1881, total: 60 }] }
    ], 'cohort', {});
    expect(smoothed[0].rows[0].total).toBe(30);
    expect(smoothed[1].rows[0].total).toBe(70);
  });
});
