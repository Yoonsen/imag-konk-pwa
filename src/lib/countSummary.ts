export const TOTAL_COUNT_LABEL = 'Totalt';
export const HITS_ROW_LIMIT = 5000;
export const HITS_FILTER_CHUNK = 4000;

export function chunkIds<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export interface ComparisonCountItem {
  term: string;
  total: number;
  docs: number;
  bookIds: number[];
}

export interface ComparisonCountSummary {
  total: number;
  uniqueDocs: number;
  uniqueDocsSum: number;
}

export function bookIdsFromHitsPayload(payload: {
  rows?: Array<{ bookId?: number }>;
}): number[] {
  const ids = (payload.rows ?? [])
    .map((row) => row.bookId)
    .filter((id): id is number => Number.isFinite(id));
  return [...new Set(ids)];
}

export function summarizeComparisonCounts(
  items: ComparisonCountItem[]
): ComparisonCountSummary {
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const uniqueDocsSum = items.reduce((sum, item) => sum + item.docs, 0);
  const collectedIds = items.flatMap((item) => item.bookIds);
  const uniqueDocs = collectedIds.length > 0
    ? new Set(collectedIds).size
    : uniqueDocsSum;
  return { total, uniqueDocs, uniqueDocsSum };
}
