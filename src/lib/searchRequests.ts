export const FULL_EXPORT_LIMIT = 5000;
export const MAX_COMPARISON_TERMS = 8;
export type ResultMode = 'render' | 'count' | 'year-count';
export type PreviewProfileId = 'quick' | 'balanced' | 'larger';

export interface PreviewProfile {
  id: PreviewProfileId;
  label: string;
  description: string;
  perBook: number;
  docSamples: number;
  totalLimit: number;
}

export const PREVIEW_PROFILES: PreviewProfile[] = [
  {
    id: 'quick',
    label: 'Rask sjekk',
    description: 'Et lite utvalg for å kontrollere søket.',
    perBook: 2,
    docSamples: 25,
    totalLimit: 80
  },
  {
    id: 'balanced',
    label: 'Balansert',
    description: 'Et representativt utgangspunkt for de fleste søk.',
    perBook: 3,
    docSamples: 50,
    totalLimit: 200
  },
  {
    id: 'larger',
    label: 'Større utvalg',
    description: 'Flere bøker og rader, men fortsatt et sample.',
    perBook: 5,
    docSamples: 200,
    totalLimit: 600
  }
];

export function matchingPreviewProfile(
  perBook: number,
  docSamples: number,
  totalLimit: number
): PreviewProfileId | null {
  return PREVIEW_PROFILES.find((profile) =>
    profile.perBook === perBook &&
    profile.docSamples === docSamples &&
    profile.totalLimit === totalLimit
  )?.id ?? null;
}

export interface SearchParameterInput {
  resultMode: ResultMode;
  perBook: number;
  docSamples: number;
  totalLimit: number;
  nearWindow: number;
  beforeWindow: number;
  afterWindow: number;
  maxVariants: number;
}

export interface NormalizedSearchParameters {
  perBook: number;
  docSamples: number;
  totalLimit: number;
  nearWindow: number;
  beforeWindow: number;
  afterWindow: number;
  maxVariants: number;
}

const integerInRange = (value: number, min: number, max: number, fallback: number) => {
  const integer = Math.floor(Number.isFinite(value) ? value : fallback);
  return Math.min(max, Math.max(min, integer));
};

export function normalizeSearchParameters(
  input: SearchParameterInput
): NormalizedSearchParameters {
  const aggregateMode = input.resultMode !== 'render';
  return {
    perBook: aggregateMode ? 0 : integerInRange(input.perBook, 1, 20, 3),
    docSamples: aggregateMode ? 0 : integerInRange(input.docSamples, 0, 50000, 50),
    totalLimit: aggregateMode ? 0 : integerInRange(input.totalLimit, 1, 5000, 200),
    nearWindow: integerInRange(input.nearWindow, 1, 50, 5),
    beforeWindow: integerInRange(input.beforeWindow, 0, 50, 15),
    afterWindow: integerInRange(input.afterWindow, 0, 50, 15),
    maxVariants: integerInRange(input.maxVariants, 1, 100, 10)
  };
}

export function fullExportLimits() {
  return {
    perBook: 0,
    docSamples: 0,
    totalLimit: FULL_EXPORT_LIMIT
  } as const;
}

export function isExportWithinLimit(total: number): boolean {
  return Number.isFinite(total) && total >= 0 && total <= FULL_EXPORT_LIMIT;
}

export function isObviouslyBroadExportQuery(query: string): boolean {
  const normalized = query.trim();
  return normalized === '*' || /^[.,;:!?]$/.test(normalized);
}

interface ConcordanceRequestContext {
  terms: string[] | null;
  termGroups: string[][] | null;
  useFilter: boolean;
  filterIds: number[];
  nearWindow: number;
  beforeWindow: number;
  afterWindow: number;
  maxVariants: number;
  symmetric: boolean;
  matchMode: 'near' | 'sequence';
}

export interface PreparedRequest {
  endpoint: 'near_query' | 'near_fragments' | 'or_query';
  body: Record<string, unknown>;
}

export function buildCountRequest(context: ConcordanceRequestContext): PreparedRequest {
  return {
    endpoint: 'near_query',
    body: {
      ...(context.terms ? { terms: context.terms } : { termGroups: context.termGroups }),
      mode: 'count',
      countMode: 'anchor',
      perBook: 0,
      docSamples: 0,
      totalLimit: 0,
      schema: 'unigrams',
      symmetric: context.symmetric,
      excludeSelf: false,
      window: context.nearWindow,
      before: Math.max(1, context.beforeWindow),
      after: Math.max(1, context.afterWindow),
      maxVariants: context.maxVariants,
      useFilter: context.useFilter,
      filterIds: context.useFilter ? context.filterIds : []
    }
  };
}

export function buildFullExportRequest(context: ConcordanceRequestContext): PreparedRequest {
  const limits = fullExportLimits();
  if (context.terms) {
    return {
      endpoint: 'or_query',
      body: {
        terms: context.terms,
        before: Math.max(1, context.beforeWindow),
        after: Math.max(1, context.afterWindow),
        ...limits,
        schema: 'unigrams',
        maxVariants: context.maxVariants,
        useFilter: context.useFilter,
        filterIds: context.useFilter ? context.filterIds : [],
        renderHits: false
      }
    };
  }

  if (context.termGroups?.length === 1) {
    return {
      endpoint: 'or_query',
      body: {
        termGroups: context.termGroups,
        before: Math.max(1, context.beforeWindow),
        after: Math.max(1, context.afterWindow),
        ...limits,
        schema: 'unigrams',
        maxVariants: context.maxVariants,
        useFilter: context.useFilter,
        filterIds: context.useFilter ? context.filterIds : [],
        renderHits: false
      }
    };
  }

  return {
    endpoint: 'near_fragments',
    body: {
      termGroups: context.termGroups,
      matchMode: context.matchMode,
      window: context.nearWindow,
      before: Math.max(1, context.beforeWindow),
      after: Math.max(1, context.afterWindow),
      ...limits,
      schema: 'unigrams',
      symmetric: context.symmetric,
      excludeSelf: false,
      maxVariants: context.maxVariants,
      useFilter: context.useFilter,
      filterIds: context.useFilter ? context.filterIds : [],
      engine: 'python'
    }
  };
}

export interface CorpusTokenStatsRequest {
  filterIds: number[];
  useFilter: boolean;
}

export interface CorpusTokenYearRow {
  year: number;
  nTokens: number;
}

export interface CorpusTokenStatsResponse {
  corpusHash: string;
  useFilter: boolean;
  requestedBookCount: number;
  bookCount: number;
  booksWithTokens: number;
  totalTokens: number;
  tokensWithoutYear: number;
  tokensByYear: Record<string, number>;
  rows: CorpusTokenYearRow[];
  cached: boolean;
  source: string;
}

export function buildCorpusTokenStatsRequest(context: {
  useFilter: boolean;
  filterIds: number[];
}): { endpoint: 'api/corpus/token-stats'; body: CorpusTokenStatsRequest } {
  return {
    endpoint: 'api/corpus/token-stats',
    body: {
      useFilter: context.useFilter,
      filterIds: context.useFilter ? context.filterIds : []
    }
  };
}
