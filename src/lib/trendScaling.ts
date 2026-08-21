export type TrendScaleMode = 'absolute' | 'relative' | 'cohort';
export type TrendSmoothingMode = 'annual' | 'five-year';

export interface TrendValueRow {
  year: number;
  total?: number;
  docs?: number;
  filterDocs?: number;
  responseMs?: number;
}

export interface TrendValueSeries<T extends TrendValueRow = TrendValueRow> {
  term: string;
  rows: T[];
}

const numericTotal = (row: TrendValueRow) =>
  typeof row.total === 'number' && Number.isFinite(row.total) ? row.total : 0;

export function scaleSingleTrendRows<T extends TrendValueRow>(
  rows: T[],
  mode: TrendScaleMode,
  tokensByYear: Record<string, number>
): T[] {
  if (mode !== 'relative') {
    return rows;
  }

  return rows.flatMap((row) => {
    const denominator = tokensByYear[String(row.year)];
    if (!Number.isFinite(denominator) || denominator <= 0) {
      return [];
    }
    return [{
      ...row,
      total: (numericTotal(row) / denominator) * 1_000_000
    }];
  });
}

export function scaleComparisonTrendSeries<T extends TrendValueRow>(
  series: TrendValueSeries<T>[],
  mode: TrendScaleMode,
  tokensByYear: Record<string, number>
): TrendValueSeries<T>[] {
  if (mode === 'absolute') {
    return series;
  }
  if (mode === 'relative') {
    return series.map((item) => ({
      ...item,
      rows: scaleSingleTrendRows(item.rows, mode, tokensByYear)
    }));
  }

  const totalsByYear = new Map<number, number>();
  series.forEach((item) => {
    item.rows.forEach((row) => {
      totalsByYear.set(row.year, (totalsByYear.get(row.year) ?? 0) + numericTotal(row));
    });
  });

  return series.map((item) => ({
    ...item,
    rows: item.rows.flatMap((row) => {
      const denominator = totalsByYear.get(row.year) ?? 0;
      if (denominator <= 0) {
        return [];
      }
      return [{
        ...row,
        total: (numericTotal(row) / denominator) * 100
      }];
    })
  }));
}

const centeredWindow = <T extends TrendValueRow>(rows: T[], year: number) =>
  rows.filter((row) => Math.abs(row.year - year) <= 2);

export function smoothSingleTrendRows<T extends TrendValueRow>(
  rows: T[],
  mode: TrendScaleMode,
  tokensByYear: Record<string, number>
): T[] {
  return rows.flatMap((row) => {
    const windowRows = centeredWindow(rows, row.year);
    if (mode === 'relative') {
      const rowsWithTokens = windowRows.filter((item) => (tokensByYear[String(item.year)] ?? 0) > 0);
      const tokenTotal = rowsWithTokens.reduce(
        (sum, item) => sum + (tokensByYear[String(item.year)] ?? 0),
        0
      );
      if (tokenTotal <= 0) return [];
      const hits = rowsWithTokens.reduce((sum, item) => sum + numericTotal(item), 0);
      return [{ ...row, total: (hits / tokenTotal) * 1_000_000 }];
    }

    const average = windowRows.reduce((sum, item) => sum + numericTotal(item), 0) /
      Math.max(windowRows.length, 1);
    return [{ ...row, total: average }];
  });
}

export function smoothComparisonTrendSeries<T extends TrendValueRow>(
  series: TrendValueSeries<T>[],
  mode: TrendScaleMode,
  tokensByYear: Record<string, number>
): TrendValueSeries<T>[] {
  if (mode !== 'cohort') {
    return series.map((item) => ({
      ...item,
      rows: smoothSingleTrendRows(item.rows, mode, tokensByYear)
    }));
  }

  return series.map((item) => ({
    ...item,
    rows: item.rows.flatMap((row) => {
      const numerator = centeredWindow(item.rows, row.year)
        .reduce((sum, windowRow) => sum + numericTotal(windowRow), 0);
      const denominator = series.reduce(
        (seriesSum, other) => seriesSum + centeredWindow(other.rows, row.year)
          .reduce((rowSum, windowRow) => rowSum + numericTotal(windowRow), 0),
        0
      );
      if (denominator <= 0) return [];
      return [{ ...row, total: (numerator / denominator) * 100 }];
    })
  }));
}

export function formatTrendValue(value: number, mode: TrendScaleMode): string {
  if (mode === 'absolute') {
    return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(value);
  }
  if (mode === 'relative') {
    return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(value);
  }
  return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(value)} %`;
}
