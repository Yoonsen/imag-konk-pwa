const METADATA_URL = 'https://api.nb.no/dhlab/get_metadata';
const DEFAULT_BATCH_SIZE = 500;

export interface ResolvedDhlabMetadata {
  dhlabid: number;
  urn: string;
  title?: string;
  author?: string;
  year?: number | string;
  category?: string;
}

type ColumnarMetadataResponse = Record<string, Record<string, unknown> | undefined>;

const stringValue = (value: unknown): string => String(value ?? '').trim();

const extractUrn = (value: unknown): string => {
  const text = stringValue(value);
  if (!text) return '';
  return text.match(/urn:nbn:[^/?#\s"']+/i)?.[0] ?? text;
};

export function normalizeUrn(value: unknown): string {
  return extractUrn(value).toLowerCase();
}

export function parseDhlabMetadataResponse(payload: unknown): ResolvedDhlabMetadata[] {
  if (!payload || typeof payload !== 'object') return [];
  const columns = payload as ColumnarMetadataResponse;
  const ids = columns.dhlabid ?? {};

  return Object.keys(ids).flatMap((index) => {
    const rawId = ids[index];
    if (rawId === null || rawId === undefined || rawId === '') return [];
    const dhlabid = Number(rawId);
    if (!Number.isFinite(dhlabid)) return [];
    const urn = stringValue(columns.urn?.[index]);
    const yearValue = columns.year?.[index];
    const literaryForm = stringValue(columns.literaryform?.[index]);
    const genres = stringValue(columns.genres?.[index]);
    return [{
      dhlabid,
      urn,
      title: stringValue(columns.title?.[index]) || undefined,
      author: stringValue(columns.authors?.[index]) || undefined,
      year: yearValue === null || yearValue === undefined || yearValue === ''
        ? undefined
        : yearValue as number | string,
      category: literaryForm || genres || undefined
    }];
  });
}

export async function resolveDhlabMetadata(
  urns: string[],
  onProgress?: (resolved: number, total: number) => void
): Promise<ResolvedDhlabMetadata[]> {
  const uniqueUrns = Array.from(new Map(
    urns
      .map((urn) => [normalizeUrn(urn), extractUrn(urn)] as const)
      .filter(([normalized]) => normalized)
  ).values());
  const resolvedRows: ResolvedDhlabMetadata[] = [];

  for (let start = 0; start < uniqueUrns.length; start += DEFAULT_BATCH_SIZE) {
    const batch = uniqueUrns.slice(start, start + DEFAULT_BATCH_SIZE);
    const response = await fetch(METADATA_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ urns: batch })
    });
    if (!response.ok) {
      throw new Error(`DHlab metadata-oppslag feilet (${response.status}): ${await response.text()}`);
    }
    resolvedRows.push(...parseDhlabMetadataResponse(await response.json()));
    onProgress?.(Math.min(start + batch.length, uniqueUrns.length), uniqueUrns.length);
  }

  return resolvedRows;
}

export async function resolveDhlabMetadataByIds(
  dhlabids: number[],
  onProgress?: (resolved: number, total: number) => void
): Promise<ResolvedDhlabMetadata[]> {
  const uniqueIds = Array.from(new Set(dhlabids.filter(Number.isFinite)));
  const resolvedRows: ResolvedDhlabMetadata[] = [];

  for (let start = 0; start < uniqueIds.length; start += DEFAULT_BATCH_SIZE) {
    const batch = uniqueIds.slice(start, start + DEFAULT_BATCH_SIZE);
    const response = await fetch(METADATA_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ dhlabids: batch })
    });
    if (!response.ok) {
      throw new Error(`DHlab metadata-oppslag feilet (${response.status}): ${await response.text()}`);
    }
    resolvedRows.push(...parseDhlabMetadataResponse(await response.json()));
    onProgress?.(Math.min(start + batch.length, uniqueIds.length), uniqueIds.length);
  }

  return resolvedRows;
}
