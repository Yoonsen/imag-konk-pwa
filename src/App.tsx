import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import * as XLSX from 'xlsx';

interface Metadata {
  id: number;
  urn: string;
  title?: string;
  author?: string;
  year?: number | string;
  category?: string;
}

interface ConcordanceRow {
  bookId: number;
  pos?: number;
  frag?: string;
  fragRaw?: string;
  fragHtml?: string;
  seqStart?: number;
  tokenLen?: number;
  surfaceText?: string;
  place?: {
    canonicalName?: string;
    geonamesId?: number | string;
    lat?: number | string;
    lon?: number | string;
    country?: string;
    variantText?: string;
  };
}

interface RenderedConcordanceRow {
  bookId: number;
  pos?: number;
  frag?: string;
}

interface ConcordanceResponse {
  rows: ConcordanceRow[];
  rendered?: RenderedConcordanceRow[];
}

interface CountResponse {
  total?: number;
  docs?: number;
}

interface PlaceResolverMatch {
  id: string;
  canonicalName?: string;
  matchedForm?: string;
  alternateForms?: string[];
  lat?: number | string;
  lon?: number | string;
  country?: string;
  matchType?: string;
}

interface PlaceResolverResponse {
  matches?: PlaceResolverMatch[];
}

interface RenderResultContext {
  trimmedQuery: string;
  normalizedBefore: number;
  normalizedAfter: number;
  normalizedNearWindow: number;
  extraGeoTermsText: string | null;
}

interface ModalData {
  title: string;
  author: string;
  year: string;
  category: string;
  dhlabid: string;
  link: string;
}

const CATEGORIES = [
  "All Categories",
  "Barnelitteratur",
  "Biografi / memoar",
  "Diktning: Dramatikk",
  "Diktning: Dramatikk # Diktning: oversatt",
  "Diktning: Epikk",
  "Diktning: Epikk # Diktning: oversatt",
  "Diktning: Lyrikk",
  "Diktning: Lyrikk # Diktning: oversatt",
  "Diverse",
  "Filosofi / estetikk / språk",
  "Historie / geografi",
  "Lesebok / skolebøker / pedagogikk",
  "Litteraturhistorie / litteraturkritikk",
  "Naturvitenskap / medisin",
  "Reiselitteratur",
  "Religiøse / oppbyggelige tekster",
  "Samfunn / politikk / juss",
  "Skisser / epistler / brev / essay / kåseri",
  "Taler / sanger / leilighetstekster",
  "Teknologi / håndverk / landbruk / havbruk"
];

const MIN_YEAR = 1814;
const MAX_YEAR = 1905;
const PLACE_RESOLVER_URL = 'https://api.nb.no/dhlab/imag/api/place/resolve';

function App() {
  const [metadataArray, setMetadataArray] = useState<Metadata[]>([]);
  const [uniqueAuthors, setUniqueAuthors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All Categories']);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [authorSearch, setAuthorSearch] = useState('');
  const [yearRange, setYearRange] = useState<[number, number]>([MIN_YEAR, MAX_YEAR]);
  const [nearWindow, setNearWindow] = useState<number>(5);
  const [beforeWindow, setBeforeWindow] = useState<number>(15);
  const [afterWindow, setAfterWindow] = useState<number>(15);
  const [perBook, setPerBook] = useState<number>(3);
  const [docSamples, setDocSamples] = useState<number>(50);
  const [totalLimit, setTotalLimit] = useState<number>(200);
  const [maxVariants, setMaxVariants] = useState<number>(10);
  const [resultMode, setResultMode] = useState<'render' | 'count'>('render');
  const [termGroupsInput, setTermGroupsInput] = useState<string>('');
  const [isSymmetric, setIsSymmetric] = useState<boolean>(true);
  const [status, setStatus] = useState('Loading corpus data...');
  const [results, setResults] = useState<React.ReactNode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showSearchParamsModal, setShowSearchParamsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [lastConcordanceRows, setLastConcordanceRows] = useState<ConcordanceRow[]>([]);
  const [lastRenderContext, setLastRenderContext] = useState<RenderResultContext | null>(null);
  const [persistentFilterIds, setPersistentFilterIds] = useState<number[] | null>(null);
  const [debugEnabled, setDebugEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('imagDebugMode') === 'true';
  });
  const [debugRequest, setDebugRequest] = useState<Record<string, unknown> | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseMetadataByIdRef = useRef<Map<number, Metadata>>(new Map());

  const parseTermGroups = (rawInput: string): string[][] | null => {
    const trimmed = rawInput.trim();
    if (!trimmed) return null;

    // 1) Strict JSON mode: [["a","b"],["c"]]
    if (trimmed.startsWith('[[')) {
      const parsed = JSON.parse(trimmed);
      const isValid =
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((group) =>
          Array.isArray(group) &&
          group.length > 0 &&
          group.every((term) => typeof term === 'string' && term.trim().length > 0)
        );

      if (!isValid) {
        throw new Error('termGroups must be JSON like [["a","b"],["c"]].');
      }

      return parsed.map((group: string[]) => group.map((term) => term.trim()));
    }

    // 2) Relaxed mode: [spise, spiste] middag -> [["spise","spiste"],["middag"]]
    const groups: string[][] = [];
    const bracketRegex = /\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    let consumed = '';

    while ((match = bracketRegex.exec(trimmed)) !== null) {
      const inside = match[1];
      const terms = inside
        .split(',')
        .map((term) => term.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      if (terms.length > 0) groups.push(terms);
      consumed += match[0];
    }

    // Remove bracket groups and tokenize remaining text into single-term groups.
    const leftover = trimmed.replace(bracketRegex, ' ').trim();
    if (leftover) {
      const singles = leftover
        .split(/\s+/)
        .map((term) => term.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      singles.forEach((term) => groups.push([term]));
    }

    if (groups.length === 0) {
      throw new Error('No valid term groups found.');
    }

    return groups;
  };

  const toSingleTermGroups = (rawQuery: string): string[][] => {
    return rawQuery
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => [token]);
  };

  const parseResolvableGeoInput = (rawQuery: string): {
    placeText: string;
    remainder: string;
    bracketed: boolean;
  } | null => {
    const trimmed = rawQuery.trim();
    const bracketedMatch = trimmed.match(/^\[#geo:"([^"]+)"\](?:\s+(.*))?$/);
    if (bracketedMatch) {
      return {
        placeText: bracketedMatch[1].trim(),
        remainder: (bracketedMatch[2] || '').trim(),
        bracketed: true
      };
    }

    const rawMatch = trimmed.match(/^#geo:"([^"]+)"(?:\s+(.*))?$/);
    if (rawMatch) {
      return {
        placeText: rawMatch[1].trim(),
        remainder: (rawMatch[2] || '').trim(),
        bracketed: false
      };
    }

    return null;
  };

  const buildResolvedGeoQuery = (resolvedId: string, remainder: string, bracketed: boolean): string => {
    const safeId = resolvedId.replace(/"/g, '').trim();
    const tokenValue = /^\d+$/.test(safeId) ? `#geo:${safeId}` : `#geo:"${safeId}"`;
    const token = `${bracketed ? '[' : ''}${tokenValue}${bracketed ? ']' : ''}`;
    return remainder ? `${token} ${remainder}` : token;
  };

  const resolvePlaceCandidates = async (placeText: string, limit = 5): Promise<PlaceResolverMatch[]> => {
    const response = await fetch(PLACE_RESOLVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: placeText, limit })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resolver error ${response.status}: ${errorText}`);
    }

    const payload: PlaceResolverResponse = await response.json();
    return Array.isArray(payload.matches) ? payload.matches : [];
  };

  const parseGeoQuery = (rawQuery: string): {
    terms: string[] | null;
    termGroups: string[][] | null;
    extraTermsText: string | null;
    invalid: boolean;
  } => {
    const trimmed = rawQuery.trim();
    if (!/#geo/.test(trimmed)) return { terms: null, termGroups: null, extraTermsText: null, invalid: false };

    // If #geo appears, it must be the first expression.
    if (!trimmed.startsWith('#geo') && !trimmed.startsWith('[#geo')) {
      return { terms: null, termGroups: null, extraTermsText: null, invalid: true };
    }

    let geoToken: string | null = null;
    let remainder = '';
    const geoTokenPattern = '#geo(?::(?:nb:)?\\d+|:(?:geonames|internal):\\S+|:"[^"]+")?';

    const bracketedMatch = trimmed.match(new RegExp(`^\\[(${geoTokenPattern})\\](?:\\s+(.*))?$`));
    if (bracketedMatch) {
      geoToken = bracketedMatch[1];
      remainder = (bracketedMatch[2] || '').trim();
    } else {
      const rawMatch = trimmed.match(new RegExp(`^(${geoTokenPattern})(?:\\s+(.*))?$`));
      if (rawMatch) {
        geoToken = rawMatch[1];
        remainder = (rawMatch[2] || '').trim();
      }
    }

    if (!geoToken) {
      return { terms: null, termGroups: null, extraTermsText: null, invalid: true };
    }

    if (!remainder) {
      return { terms: [geoToken], termGroups: null, extraTermsText: null, invalid: false };
    }

    try {
      const parsedGroups = parseTermGroups(remainder);
      if (!parsedGroups || parsedGroups.length === 0) {
        return { terms: null, termGroups: null, extraTermsText: null, invalid: true };
      }

      const extraTermsText = parsedGroups.flat().join(' ');
      return {
        terms: null,
        termGroups: [[geoToken], ...parsedGroups],
        extraTermsText,
        invalid: false
      };
    } catch {
      return { terms: null, termGroups: null, extraTermsText: null, invalid: true };
    }
  };

  const getNbGeoFallbackToken = (token: string): string | null => {
    const primaryMatch = token.match(/^#geo:(\d+)$/);
    if (primaryMatch) {
      return `#geo:nb:${primaryMatch[1]}`;
    }

    const prefixedMatch = token.match(/^#geo:nb:(\d+)$/);
    if (prefixedMatch) {
      return `#geo:${prefixedMatch[1]}`;
    }

    return null;
  };

  const withGeoAnnotationTitles = (html: string): string => {
    if (!html || typeof window === 'undefined') return html;
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="geo-wrap">${html}</div>`, 'text/html');
    const wrapper = doc.getElementById('geo-wrap');
    if (!wrapper) return html;

    wrapper.querySelectorAll('annotation[data-layer="geo"]').forEach((node) => {
      const canonicalName = node.getAttribute('data-geo-canonical-name') || node.getAttribute('data-geo-canonical');
      const country = node.getAttribute('data-geo-country');
      const lat = node.getAttribute('data-geo-lat');
      const lon = node.getAttribute('data-geo-lon');
      const geonamesId = node.getAttribute('data-geo-geonames-id');
      const placeId = node.getAttribute('data-geo-place-id');
      const tooltipParts = [
        canonicalName && `Sted: ${canonicalName}`,
        country && `Land: ${country}`,
        geonamesId && `Geonames: ${geonamesId}`,
        placeId && `Place ID: ${placeId}`,
        lat && lon && `Koordinater: ${lat}, ${lon}`
      ].filter(Boolean);

      if (tooltipParts.length > 0) {
        node.setAttribute('data-geo-tooltip', tooltipParts.join(' | '));
        node.removeAttribute('title');
      }
    });

    return wrapper.innerHTML;
  };

  const mergeGeoRenderedFragment = (row: ConcordanceRow, renderedFrag: string | undefined): string | null => {
    if (!renderedFrag) return null;

    const annotationHtml = row.fragHtml ? withGeoAnnotationTitles(row.fragHtml) : null;
    if (!annotationHtml) return renderedFrag;

    const candidates = [row.surfaceText, row.fragRaw, row.frag]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());

    for (const candidate of candidates) {
      const bracketedCandidate = `[${candidate}]`;
      if (renderedFrag.includes(bracketedCandidate)) {
        return renderedFrag.replace(bracketedCandidate, `[${annotationHtml}]`);
      }
    }

    return renderedFrag;
  };

  const buildNationalLibraryLink = (urn: string | undefined, searchText: string): string => {
    if (urn && urn.trim().length > 0) {
      return `https://www.nb.no/items/${urn}?searchText=${encodeURIComponent(searchText)}`;
    }
    return `https://www.nb.no/search?q=${encodeURIComponent(searchText)}`;
  };

  useEffect(() => {
    const timestamp = new Date().getTime();
    const jsonUrl = `corpus.json?v=${timestamp}`;

    fetch(jsonUrl)
      .then(res => res.json())
      .then(data => {
        const sanitizedData = JSON.parse(
          JSON.stringify(data, (_, value) => 
            typeof value === "number" && isNaN(value) ? null : value
          )
        );

        if (sanitizedData && Array.isArray(sanitizedData.dhlabids)) {
          const baseMetadata = sanitizedData.dhlabids.filter(
            (item: Metadata) => Number.isFinite(Number(item.id))
          ) as Metadata[];
          baseMetadataByIdRef.current = new Map(
            baseMetadata.map((item) => [Number(item.id), item])
          );
          setMetadataArray(sanitizedData.dhlabids);
          setPersistentFilterIds(null);
          setSelectedAuthors([]);
          setAuthorSearch('');
          setSelectedCategories(['All Categories']);
          setYearRange([MIN_YEAR, MAX_YEAR]);
          setResults(null);
          setLastConcordanceRows([]);
          setDebugRequest(null);
          setDebugInfo(null);
          // Extract unique authors
          const authors = Array.from(new Set(
            sanitizedData.dhlabids
              .map((item: Metadata) => item.author)
              .filter((author: string | undefined): author is string => !!author)
          )).sort() as string[];
          setUniqueAuthors(authors);
          setStatus(`Loaded metadata for ${sanitizedData.dhlabids.length} documents.`);
        } else {
          setStatus("Error: No valid metadata array found in JSON.");
          console.error("No valid metadata array in data:", sanitizedData);
        }
      })
      .catch(err => {
        setStatus(`Error loading metadata: ${err.message}`);
        console.error("Failed to load metadata:", err);
      });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('imagDebugMode', String(debugEnabled));
    }
  }, [debugEnabled]);

  const performSearch = async (overrideQuery?: string) => {
    let trimmedQuery = (overrideQuery ?? query).trim();

    if (/^:debug\s+on$/i.test(trimmedQuery)) {
      setDebugEnabled(true);
      setStatus("Debug mode enabled.");
      return;
    }

    if (/^:debug\s+off$/i.test(trimmedQuery)) {
      setDebugEnabled(false);
      setStatus("Debug mode disabled.");
      return;
    }

    if (!trimmedQuery) {
      alert("Please enter a search term");
      return;
    }

    if (!metadataArray || metadataArray.length === 0) {
      alert("Metadata not loaded yet. Please try again.");
      return;
    }

    setIsLoading(true);
    setStatus("Searching...");
    setResults(null);
    setLastConcordanceRows([]);
    setLastRenderContext(null);

    try {
      const geoResolverInput = parseResolvableGeoInput(trimmedQuery);
      if (geoResolverInput) {
        setStatus(`Resolving place: ${geoResolverInput.placeText}...`);
        const resolverMatches = await resolvePlaceCandidates(geoResolverInput.placeText);
        const normalizedPlaceText = geoResolverInput.placeText.toLowerCase();
        const exactMatches = resolverMatches.filter((match) =>
          match.matchType === 'exact' ||
          [match.id, match.canonicalName, match.matchedForm]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .some((value) => value.toLowerCase() === normalizedPlaceText)
        );
        const selectedMatch = exactMatches.length === 1
          ? exactMatches[0]
          : resolverMatches.length === 1
            ? resolverMatches[0]
            : exactMatches.length > 0
              ? exactMatches[0]
              : null;

        if (!selectedMatch) {
          setStatus(`Fant ${resolverMatches.length} stedskandidater for "${geoResolverInput.placeText}". Velg en kandidat for å fortsette.`);
          setLastConcordanceRows([]);
          setDebugInfo({
            resolverQuery: geoResolverInput.placeText,
            resolverMatches: resolverMatches.map((match) => ({
              id: match.id,
              canonicalName: match.canonicalName,
              country: match.country,
              matchType: match.matchType
            }))
          });
          setResults(
            <div className="concordance">
              <p><strong>Mulige steder for "{geoResolverInput.placeText}"</strong></p>
              <div className="list-group">
                {resolverMatches.map((match) => {
                  const nextQuery = buildResolvedGeoQuery(match.id, geoResolverInput.remainder, geoResolverInput.bracketed);
                  const alternateForms = (match.alternateForms || []).filter(Boolean).slice(0, 5);
                  return (
                    <button
                      key={`${match.id}-${match.country ?? 'unknown'}`}
                      type="button"
                      className="list-group-item list-group-item-action"
                      title={`Bruk ${match.canonicalName || match.id}`}
                      onClick={() => {
                        setQuery(nextQuery);
                        void performSearch(nextQuery);
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-start gap-3">
                        <div className="text-start">
                          <div className="fw-semibold">{match.canonicalName || match.id}</div>
                          <div className="small text-muted">
                            id: {match.id}
                            {match.country ? ` | ${match.country}` : ''}
                          </div>
                        </div>
                        {match.matchType && (
                          <span className="badge text-bg-secondary text-uppercase">{match.matchType}</span>
                        )}
                      </div>
                      {match.matchedForm && (
                        <div className="small mt-1">
                          <strong>Treffform:</strong> {match.matchedForm}
                        </div>
                      )}
                      {(match.lat !== undefined || match.lon !== undefined) && (
                        <div className="small text-muted">
                          koordinater: {match.lat ?? '?'}{match.lon !== undefined ? `, ${match.lon}` : ''}
                        </div>
                      )}
                      {alternateForms.length > 0 && (
                        <div className="small text-muted">
                          alternativer: {alternateForms.join(', ')}
                        </div>
                      )}
                      <div className="small text-primary mt-1">Klikk for å bruke dette stedet</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
          return;
        }

        trimmedQuery = buildResolvedGeoQuery(selectedMatch.id, geoResolverInput.remainder, geoResolverInput.bracketed);
        setQuery(trimmedQuery);
      }

      const geoQuery = parseGeoQuery(trimmedQuery);
      if (geoQuery.invalid) {
        setStatus('Ugyldig geo-søk. Bruk #geo med valgfrie ordgrupper, #geo:"stednavn", eller #geo:<nb_id> / #geo:nb:<nb_id>.');
        setResults(<p key="geo-format-error" className="error">Ugyldig geo-format.</p>);
        return;
      }

      const hasQuotedPhrase = /^"[^"]+"$/.test(trimmedQuery);
      const normalizedQuery = hasQuotedPhrase ? trimmedQuery.slice(1, -1).trim() : trimmedQuery;
      const words = normalizedQuery.split(/\s+/).filter(Boolean);
      let parsedTermGroups: string[][] | null = null;
      const termGroupsSource = termGroupsInput.trim() || (trimmedQuery.includes('[') ? trimmedQuery : '');
      const autoTermGroups =
        !termGroupsInput.trim() && !trimmedQuery.includes('[') && words.length >= 1
          ? toSingleTermGroups(normalizedQuery)
          : null;

      if (termGroupsSource) {
        try {
          parsedTermGroups = parseTermGroups(termGroupsSource);
        } catch (error) {
          setStatus(`Invalid termGroups format: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setResults(<p key="term-groups-error" className="error">Invalid termGroups format.</p>);
          return;
        }
      }

      const effectiveTermGroups = (geoQuery.terms || geoQuery.termGroups) ? null : (parsedTermGroups ?? autoTermGroups);

      if (!effectiveTermGroups && !geoQuery.terms && !geoQuery.termGroups) {
        alert("Please enter a search term");
        return;
      }

      // Filter URNs by selected categories, authors, and year range
      const filteredMetadata = metadataArray.filter(item => {
        const categoryMatch = selectedCategories.includes('All Categories') || 
          (item.category && selectedCategories.includes(item.category));
        
        const authorMatch = selectedAuthors.length === 0 || 
          (item.author && selectedAuthors.includes(item.author));
        
        const year = Number(item.year ?? 0);
        const yearMatch = year >= yearRange[0] && year <= yearRange[1];
        
        return categoryMatch && authorMatch && yearMatch;
      });

      if (filteredMetadata.length === 0) {
        setStatus("No documents match the selected filters.");
        setResults(<p key="no-filter-results">No documents match the selected filters.</p>);
        return;
      }

      const filterIds = filteredMetadata.map(item => item.id);
      const hasFilterModalConstraints =
        !selectedCategories.includes('All Categories') ||
        selectedAuthors.length > 0 ||
        yearRange[0] !== MIN_YEAR ||
        yearRange[1] !== MAX_YEAR;
      const baseFilterIds = persistentFilterIds
        ? (hasFilterModalConstraints ? filterIds : persistentFilterIds)
        : filterIds;
      const effectiveFilterIds = baseFilterIds;
      const useFilter = persistentFilterIds
        ? effectiveFilterIds.length > 0
        : (effectiveFilterIds.length > 0 && effectiveFilterIds.length < metadataArray.length);
      const normalizedNearWindow = Math.max(1, Math.floor(nearWindow) || 1);
      const normalizedBefore = Math.max(0, Math.floor(beforeWindow) || 0);
      const normalizedAfter = Math.max(0, Math.floor(afterWindow) || 0);
      const normalizedOrQueryBefore = Math.max(1, normalizedBefore);
      const normalizedOrQueryAfter = Math.max(1, normalizedAfter);
      const normalizedPerBook = Math.max(1, Math.floor(perBook) || 1);
      const normalizedDocSamples = Math.max(0, Math.floor(docSamples) || 0);
      const normalizedTotalLimit = Math.max(1, Math.floor(totalLimit) || 1);
      const normalizedOrQueryTotalLimit = Math.min(normalizedTotalLimit, 5000);
      const normalizedMaxVariants = Math.max(1, Math.floor(maxVariants) || 1);
      const effectiveMatchMode: 'sequence' | 'near' = hasQuotedPhrase ? 'sequence' : 'near';
      const usesOrQuery = !!effectiveTermGroups && effectiveTermGroups.length === 1;
      const usesNearQueryCount = !geoQuery.termGroups && !!effectiveTermGroups && effectiveTermGroups.length > 1 && resultMode === 'count';
      const usesInlineTermGroups = !!parsedTermGroups && !termGroupsInput.trim() && trimmedQuery.includes('[');
      const usesAutoPhraseTermGroups = !!autoTermGroups && words.length >= 2;
      const usesFastNearProfile = usesInlineTermGroups || usesAutoPhraseTermGroups;

      // Keep the user-selected per-book sample count; only trim broader cost drivers below.
      const effectivePerBook = normalizedPerBook;
      const effectiveDocSamples = normalizedDocSamples;
      const effectiveTotalLimit = usesFastNearProfile ? Math.min(normalizedTotalLimit, 100) : normalizedTotalLimit;
      const effectiveMaxVariants = usesFastNearProfile ? Math.min(normalizedMaxVariants, 6) : normalizedMaxVariants;

      const endpointPath = geoQuery.termGroups
        ? "near_query"
        : geoQuery.terms
        ? "or_query"
        : usesNearQueryCount
        ? "near_query"
        : usesOrQuery
        ? "or_query"
        : "near_fragments";

      const requestBody = geoQuery.termGroups
        ? {
            termGroups: geoQuery.termGroups,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            mode: resultMode,
            perBook: effectivePerBook,
            totalLimit: effectiveTotalLimit,
            docSamples: effectiveDocSamples,
            schema: "unigrams",
            symmetric: isSymmetric,
            excludeSelf: false,
            window: normalizedNearWindow,
            before: normalizedBefore,
            after: normalizedAfter
          }
        : geoQuery.terms
        ? {
            terms: geoQuery.terms,
            before: normalizedOrQueryBefore,
            after: normalizedOrQueryAfter,
            docSamples: effectiveDocSamples,
            totalLimit: normalizedOrQueryTotalLimit,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            renderHits: true
          }
        : endpointPath === "near_query"
        ? {
            termGroups: effectiveTermGroups,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            mode: "count",
            perBook: effectivePerBook,
            totalLimit: effectiveTotalLimit,
            docSamples: effectiveDocSamples,
            schema: "unigrams",
            symmetric: isSymmetric,
            excludeSelf: false,
            window: normalizedNearWindow,
            before: normalizedBefore,
            after: normalizedAfter
          }
        : endpointPath === "near_fragments"
        ? {
            termGroups: effectiveTermGroups,
            matchMode: effectiveMatchMode,
            window: normalizedNearWindow,
            before: normalizedBefore,
            after: normalizedAfter,
            perBook: effectivePerBook,
            docSamples: effectiveDocSamples,
            totalLimit: effectiveTotalLimit,
            schema: "unigrams",
            symmetric: isSymmetric,
            excludeSelf: false,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            maxVariants: effectiveMaxVariants,
            engine: "python"
          }
        : endpointPath === "or_query"
          ? {
              termGroups: effectiveTermGroups,
              before: normalizedOrQueryBefore,
              after: normalizedOrQueryAfter,
              perBook: effectivePerBook,
              docSamples: effectiveDocSamples,
              totalLimit: normalizedOrQueryTotalLimit,
              schema: "unigrams",
              useFilter,
              filterIds: useFilter ? effectiveFilterIds : [],
              maxVariants: effectiveMaxVariants
            }
        : null;

      if (!requestBody) {
        throw new Error(`Unsupported endpoint configuration: ${endpointPath}`);
      }

      setDebugRequest({
        endpoint: endpointPath,
        ...requestBody,
        geoFallbackCandidate: geoQuery.terms && geoQuery.terms.length === 1 ? getNbGeoFallbackToken(geoQuery.terms[0]) : null,
        filterIds: `[${useFilter ? effectiveFilterIds.length : 0} ids]`
      });

      const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const usedEngine = endpointPath === "near_fragments" ? "python" : null;
      const runSearchRequest = (body: Record<string, unknown>) => fetch(`https://api.nb.no/dhlab/imag/${endpointPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const buildFallbackRequestBody = (token: string): typeof requestBody => ({
        ...requestBody,
        terms: [token]
      } as typeof requestBody);
      const fallbackGeoToken = geoQuery.terms && geoQuery.terms.length === 1
        ? getNbGeoFallbackToken(geoQuery.terms[0])
        : null;
      let activeRequestBody: typeof requestBody = requestBody;
      let activeGeoToken = geoQuery.terms?.[0] ?? null;
      let geoFallbackApplied = false;

      let concResp = await runSearchRequest(activeRequestBody);
      if (!concResp.ok && concResp.status === 404 && fallbackGeoToken && activeGeoToken !== fallbackGeoToken) {
        activeRequestBody = buildFallbackRequestBody(fallbackGeoToken);
        activeGeoToken = fallbackGeoToken;
        geoFallbackApplied = true;
        concResp = await runSearchRequest(activeRequestBody);
      }

      if (!concResp.ok) {
        const errorText = await concResp.text();
        if (concResp.status === 404) {
          const categoryText = selectedCategories.includes('All Categories')
            ? ''
            : ` in categories: ${selectedCategories.join(', ')}`;
          const authorText = selectedAuthors.length > 0
            ? ` by authors: ${selectedAuthors.join(', ')}`
            : '';
          const yearText = yearRange[0] === MIN_YEAR && yearRange[1] === MAX_YEAR
            ? ''
            : ` from ${yearRange[0]} to ${yearRange[1]}`;
          setStatus(`No results for "${trimmedQuery}"${categoryText}${authorText}${yearText}`);
          setResults(<p key="no-results">No results found for this query.</p>);
          setLastConcordanceRows([]);
          setDebugInfo({
            endpoint: endpointPath,
            queryMode: endpointPath,
            httpStatus: 404,
            backendMessage: errorText
          });
          return;
        }
        throw new Error(`HTTP error ${concResp.status}: ${errorText}`);
      }

      const responseElapsedMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - requestStartedAt
      );

      if ((geoQuery.termGroups && resultMode === 'count') || usesNearQueryCount) {
        const countResp: CountResponse = await concResp.json();
        const categoryText = selectedCategories.includes('All Categories')
          ? ''
          : ` in categories: ${selectedCategories.join(', ')}`;
        const authorText = selectedAuthors.length > 0
          ? ` by authors: ${selectedAuthors.join(', ')}`
          : '';
        const yearText = yearRange[0] === MIN_YEAR && yearRange[1] === MAX_YEAR
          ? ''
          : ` from ${yearRange[0]} to ${yearRange[1]}`;
        const total = typeof countResp.total === 'number' ? countResp.total : 0;
        const docs = typeof countResp.docs === 'number' ? countResp.docs : 0;

        setStatus(`Found ${total} matches for "${trimmedQuery}"${categoryText}${authorText}${yearText} (docs: ${docs}, ${responseElapsedMs} ms)`);
        setLastConcordanceRows([]);
        setResults(
          <div className="concordance">
            <p><strong>Treff:</strong> {total}</p>
            <p><strong>Dokumenter:</strong> {docs}</p>
            <p><strong>Tid:</strong> {responseElapsedMs} ms</p>
          </div>
        );
        setDebugInfo({
          endpoint: endpointPath,
          queryMode: endpointPath,
          usedEngine: null,
          isGeoQuery: !!geoQuery.termGroups,
          resultMode,
          total,
          docs,
          responseMs: responseElapsedMs,
          filteredDocs: filteredMetadata.length,
          useFilter,
          filterIdsCount: useFilter ? effectiveFilterIds.length : 0
        });
        return;
      }

      let conc: ConcordanceResponse = await concResp.json();
      if (geoQuery.terms && !geoFallbackApplied && fallbackGeoToken && activeGeoToken !== fallbackGeoToken) {
        const currentRows = Array.isArray(conc.rows) ? conc.rows : [];
        const currentRenderedRows = Array.isArray(conc.rendered) ? conc.rendered : [];
        if (currentRows.length === 0 && currentRenderedRows.length === 0) {
          activeRequestBody = buildFallbackRequestBody(fallbackGeoToken);
          activeGeoToken = fallbackGeoToken;
          geoFallbackApplied = true;
          const fallbackResp = await runSearchRequest(activeRequestBody);
          if (fallbackResp.ok) {
            conc = await fallbackResp.json();
          }
        }
      }
      const categoryText = selectedCategories.includes('All Categories') 
        ? '' 
        : ` in categories: ${selectedCategories.join(', ')}`;
      const authorText = selectedAuthors.length > 0
        ? ` by authors: ${selectedAuthors.join(', ')}`
        : '';
      const yearText = yearRange[0] === MIN_YEAR && yearRange[1] === MAX_YEAR
        ? ''
        : ` from ${yearRange[0]} to ${yearRange[1]}`;
      const rows = Array.isArray(conc.rows) ? conc.rows : [];
      const renderedRows = Array.isArray(conc.rendered) ? conc.rendered : [];
      const mergedRows = geoQuery.terms && renderedRows.length > 0
        ? rows.map((row, index) => {
            const renderedMatch = renderedRows.find((renderedRow) =>
              renderedRow.bookId === row.bookId &&
              renderedRow.pos === row.pos
            ) || renderedRows[index];
            const mergedFrag = renderedMatch?.frag;
            const mergedFragHtml = mergeGeoRenderedFragment(row, mergedFrag);

            return {
              ...row,
              frag: mergedFrag ?? row.frag,
              fragRaw: mergedFrag ?? row.fragRaw,
              fragHtml: mergedFragHtml ?? row.fragHtml
            };
          })
        : rows;
      const sampledDocs = new Set(mergedRows.map((row) => row.bookId)).size;
      const expectedSampleCap = effectiveDocSamples * effectivePerBook;
      setStatus(
        `Found ${mergedRows.length} results for "${trimmedQuery}"${categoryText}${authorText}${yearText} ` +
        `(sampled docs: ${sampledDocs}, cap: ${expectedSampleCap}, ${responseElapsedMs} ms)`
      );
      setLastConcordanceRows(mergedRows);
      setLastRenderContext({
        trimmedQuery,
        normalizedBefore,
        normalizedAfter,
        normalizedNearWindow,
        extraGeoTermsText: geoQuery.extraTermsText
      });
      const debugPreviewMeta = mergedRows.length > 0
        ? metadataArray.find(item => item.id === mergedRows[0].bookId)
        : undefined;
      const debugPreviewQuery = `"${trimmedQuery}"~${normalizedNearWindow}`;
      const debugPreviewLink = debugPreviewMeta
        ? buildNationalLibraryLink(debugPreviewMeta.urn, debugPreviewQuery)
        : null;
      setDebugInfo({
        endpoint: endpointPath,
        queryMode: endpointPath,
        usedEngine,
        isGeoQuery: !!geoQuery.terms,
        resultMode: (geoQuery.termGroups || (!!effectiveTermGroups && effectiveTermGroups.length > 1)) ? resultMode : null,
        rows: mergedRows.length,
        renderedRows: renderedRows.length,
        geoRenderedMergeApplied: !!geoQuery.terms && renderedRows.length > 0,
        geoFallbackApplied,
        geoTokenUsed: activeGeoToken,
        sampledDocs,
        expectedSampleCap,
        perBook: effectivePerBook,
        docSamples: effectiveDocSamples,
        responseMs: responseElapsedMs,
        fastProfileApplied: usesFastNearProfile,
        matchMode: endpointPath === "near_fragments" ? effectiveMatchMode : null,
        phraseQuoted: hasQuotedPhrase,
        hasPersistentFilterIds: !!persistentFilterIds,
        filteredDocs: filteredMetadata.length,
        useFilter,
        filterIdsCount: useFilter ? effectiveFilterIds.length : 0,
        nbPreviewLink: debugPreviewLink
      });

      if (mergedRows.length === 0) {
        setResults(<p key="no-results">No results found for this query.</p>);
        return;
      }
      setResults(null);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setResults(<p key="error" className="error">Search failed: {error instanceof Error ? error.message : 'Unknown error'}</p>);
      setLastConcordanceRows([]);
      setDebugInfo({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCorpusUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCorpusFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('No sheets found in workbook.');
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const parsedMetadata = rows
        .map((row) => {
          const lowerCasedRow = Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value])
          );

          const rawId = lowerCasedRow.id ?? lowerCasedRow.dhlabid ?? lowerCasedRow.bookid;
          const rawUrn = lowerCasedRow.urn;

          const id = Number(rawId);
          const urn = String(rawUrn ?? '').trim();
          const yearValue = lowerCasedRow.year;

          return {
            id,
            urn,
            title: String(lowerCasedRow.title ?? '').trim() || undefined,
            author: String(lowerCasedRow.author ?? '').trim() || undefined,
            category: String(lowerCasedRow.category ?? '').trim() || undefined,
            year: yearValue === '' ? undefined : (yearValue as number | string)
          } as Metadata;
        })
        .filter((item) => Number.isFinite(item.id))
        .map((item) => {
          const base = baseMetadataByIdRef.current.get(item.id);
          return {
            ...item,
            urn: item.urn || base?.urn || '',
            title: item.title || base?.title,
            author: item.author || base?.author,
            category: item.category || base?.category,
            year: item.year ?? base?.year
          } as Metadata;
        });

      if (parsedMetadata.length === 0) {
        throw new Error('No valid corpus rows found. Expected at least id/dhlabid (urn is optional).');
      }

      const authors = Array.from(
        new Set(
          parsedMetadata
            .map((item) => item.author)
            .filter((author): author is string => !!author)
        )
      ).sort();

      setMetadataArray(parsedMetadata);
      setPersistentFilterIds(parsedMetadata.map((item) => item.id));
      setUniqueAuthors(authors);
      setSelectedAuthors([]);
      setAuthorSearch('');
      setSelectedCategories(['All Categories']);
      setYearRange([MIN_YEAR, MAX_YEAR]);
      setResults(null);
      setLastConcordanceRows([]);
      setDebugRequest(null);
      setDebugInfo(null);
      setStatus(`Loaded metadata for ${parsedMetadata.length} documents from "${file.name}".`);
    } catch (error) {
      setStatus(`Error loading corpus file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadConcordance = () => {
    if (lastConcordanceRows.length === 0) {
      alert('No concordance results to download yet.');
      return;
    }

    const rows = lastConcordanceRows.map((row) => {
      const metadata = metadataArray.find((item) => item.id === row.bookId);
      return {
        dhlabid: row.bookId,
        pos: row.pos,
        frag: row.frag,
        urn: metadata?.urn ?? '',
        title: metadata?.title ?? '',
        author: metadata?.author ?? '',
        year: metadata?.year ?? '',
        category: metadata?.category ?? ''
      };
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Concordance');
    XLSX.writeFile(workbook, `concordance-${dateStamp}.xlsx`);
  };

  const handleConcordanceClick = (metadata: Metadata | undefined, link: string) => {
    if (metadata) {
      setModalData({
        title: metadata.title || "Unknown Title",
        author: metadata.author || "Unknown Author",
        year: metadata.year !== undefined ? String(metadata.year) : "Unknown Year",
        category: metadata.category || "Unknown Category",
        dhlabid: String(metadata.id),
        link: link
      });
      setShowModal(true);
    }
  };

  const handleAuthorSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthorSearch(e.target.value);
  };

  const handleAuthorSelect = (author: string) => {
    if (!selectedAuthors.includes(author)) {
      setSelectedAuthors([...selectedAuthors, author]);
    }
    setAuthorSearch('');
  };

  const handleAuthorRemove = (authorToRemove: string) => {
    setSelectedAuthors(selectedAuthors.filter(author => author !== authorToRemove));
  };

  const filteredAuthors = uniqueAuthors.filter(author => 
    author.toLowerCase().includes(authorSearch.toLowerCase())
  ).slice(0, 10); // Limit to 10 suggestions

  const handleCategoryToggle = (category: string) => {
    if (category === 'All Categories') {
      setSelectedCategories(['All Categories']);
      return;
    }

    const withoutAll = selectedCategories.filter((value) => value !== 'All Categories');
    const nextCategories = withoutAll.includes(category)
      ? withoutAll.filter((value) => value !== category)
      : [...withoutAll, category];

    setSelectedCategories(nextCategories.length > 0 ? nextCategories : ['All Categories']);
  };

  const handleYearRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (e.target.name === 'minYear') {
      setYearRange([value, yearRange[1]]);
    } else {
      setYearRange([yearRange[0], value]);
    }
  };

  const buildConcordanceResults = (rows: ConcordanceRow[], context: RenderResultContext): React.ReactNode[] => {
    return rows.map((row, index) => {
      const textHtml = row.fragHtml ? withGeoAnnotationTitles(row.fragHtml) : null;
      const textRaw = row.fragRaw ?? row.frag ?? '';
      const metadata = metadataArray.find(item => item.id === row.bookId);
      const nbProximity = Math.max(context.normalizedBefore, context.normalizedAfter);
      const baseSearchExpression = `"${context.trimmedQuery}"~${nbProximity}`;
      const baseUrnLink = buildNationalLibraryLink(metadata?.urn, baseSearchExpression);

      return (
        <div
          key={index}
          className="concordance"
          data-book-id={row.bookId}
          onClick={(event) => {
            if (!metadata) return;
            const target = event.target as HTMLElement;
            const annotationEl = target.closest('annotation[data-layer="geo"]') as HTMLElement | null;

            if (annotationEl) {
              const geoSearchTerm = annotationEl.textContent?.trim() || context.trimmedQuery;
              const extraGeoTerm = context.extraGeoTermsText;
              const escapedGeoTerm = geoSearchTerm.replace(/"/g, '\\"').trim();
              const escapedExtraTerm = extraGeoTerm ? extraGeoTerm.replace(/"/g, '\\"').trim() : null;
              const geoSearchExpression = escapedExtraTerm
                ? `"${escapedGeoTerm} ${escapedExtraTerm}"~${context.normalizedNearWindow}`
                : escapedGeoTerm;
              const geoUrnLink = buildNationalLibraryLink(metadata.urn, geoSearchExpression);
              handleConcordanceClick(metadata, geoUrnLink);
              return;
            }

            handleConcordanceClick(metadata, baseUrnLink);
          }}
        >
          {debugEnabled && (
            <div className="text-muted" style={{ fontSize: "11px" }}>
              dhlabid: {row.bookId}
            </div>
          )}
          {textHtml
            ? <p dangerouslySetInnerHTML={{ __html: textHtml }} />
            : textRaw
              ? <p>{textRaw}</p>
              : <p className="text-muted fst-italic">Ingen fragmenttekst fra backend.</p>}
        </div>
      );
    });
  };

  return (
    <div className="container my-4">
      <h1 className="text-center mb-4 d-flex justify-content-center align-items-center gap-2">
        <span>ImagiNation Concordances</span>
        <button
          className="btn btn-sm btn-outline-secondary rounded-circle d-inline-flex align-items-center justify-content-center"
          type="button"
          onClick={() => setShowHelpModal(true)}
          title="Søkehjelp og eksempler"
          aria-label="Søkehjelp og eksempler"
          style={{ width: "30px", height: "30px", padding: 0 }}
        >
          <i className="bi bi-info-circle"></i>
        </button>
      </h1>
      <div className="row justify-content-center mb-3">
        <div className="col-md-8">
          <div className="d-flex flex-wrap flex-md-nowrap align-items-start gap-1">
            <div className="input-group flex-grow-1" style={{ minWidth: "200px" }}>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  void performSearch();
                }}
                disabled={isLoading}
                title="Search"
              >
                <i className="bi bi-search"></i>
              </button>
              <input
                type="text"
                className="form-control"
                placeholder='f.eks. norge, "norge i krig", #geo krig, #geo:1032414'
                title='Eksempler: norge | "norge i krig" | #geo | #geo krig | #geo:"Rio de Janeiro" | #geo:1032414 | #geo:nb:1032414'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    void performSearch();
                  }
                }}
              />
            </div>

            <div className="d-flex flex-wrap flex-md-nowrap align-items-start gap-1">
              <div className="btn-group" role="group" aria-label="Result mode actions">
                <button
                  className={`btn ${resultMode === 'render' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  type="button"
                  onClick={() => setResultMode('render')}
                  title="Vis konkordanser"
                >
                  Konk
                </button>
                <button
                  className={`btn ${resultMode === 'count' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  type="button"
                  onClick={() => setResultMode('count')}
                  title="Vis telling for flergruppesøk"
                >
                  Tell
                </button>
              </div>

              <div className="btn-group" role="group" aria-label="Korpus actions">
                <button 
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={() => setShowFilterModal(true)}
                  title="Korpusfiltrering"
                >
                  <i className="bi bi-tools"></i>
                </button>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={handleCorpusUploadClick}
                  title="Upload corpus Excel file"
                >
                  <i className="bi bi-file-earmark-spreadsheet"></i>
                </button>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={() => setShowSearchParamsModal(true)}
                  title="Søkeparametre"
                >
                  <i className="bi bi-sliders"></i>
                </button>
              </div>

              <div className="btn-group" role="group" aria-label="Debug actions">
                <button
                  className={`btn ${debugEnabled ? 'btn-warning' : 'btn-outline-secondary'}`}
                  type="button"
                  onClick={() => setDebugEnabled(!debugEnabled)}
                  title="Toggle debug mode"
                >
                  <i className="bi bi-bug"></i>
                </button>
              </div>

              <div className="btn-group" role="group" aria-label="Download actions">
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={handleDownloadConcordance}
                  title="Download concordance (.xlsx)"
                  disabled={lastConcordanceRows.length === 0}
                >
                  <i className="bi bi-download"></i>
                </button>
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleCorpusFileChange}
          />
        </div>
      </div>
      <div className="border p-3" style={{ overflowY: "auto", height: "calc(100vh - 200px)" }}>
        <div style={{ fontSize: "12px", marginBottom: "10px", color: "#555" }}>{status}</div>
        {debugEnabled && (
          <div className="accordion mb-3" id="debugAccordion">
            <div className="accordion-item">
              <h2 className="accordion-header" id="debugHeading">
                <button
                  className="accordion-button collapsed py-2"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#debugCollapse"
                  aria-expanded="false"
                  aria-controls="debugCollapse"
                >
                  Debug
                </button>
              </h2>
              <div
                id="debugCollapse"
                className="accordion-collapse collapse"
                aria-labelledby="debugHeading"
                data-bs-parent="#debugAccordion"
              >
                <div className="accordion-body py-2 px-3" style={{ fontSize: "12px" }}>
                  <pre style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                    {JSON.stringify({ request: debugRequest, info: debugInfo }, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
        {lastRenderContext && lastConcordanceRows.length > 0 ? (
          <>
            <div className="small text-muted mb-2">
              Konk viser treffene som er hentet ut med innstillingene i verktøymenyen. Trykk på en konkordans for bokinfo og lenke til Nettbiblioteket.
            </div>
            {buildConcordanceResults(lastConcordanceRows, lastRenderContext)}
          </>
        ) : (
          results
        )}
      </div>

      {/* Results Modal */}
      <div className={`modal fade ${showModal ? 'show' : ''}`} 
           style={{ display: showModal ? 'block' : 'none' }} 
           tabIndex={-1} 
           role="dialog">
        <div className="modal-dialog" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{modalData?.title}</h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setShowModal(false)}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <p><strong>Author:</strong> {modalData?.author}</p>
              <p><strong>Year:</strong> {modalData?.year}</p>
              <p><strong>Category:</strong> {modalData?.category}</p>
              <p><strong>dhlabid:</strong> {modalData?.dhlabid}</p>
            </div>
            <div className="modal-footer">
              <a 
                href={modalData?.link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-primary"
              >
                View in National Library
              </a>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Modal */}
      <div className={`modal fade ${showFilterModal ? 'show' : ''}`} 
           style={{ display: showFilterModal ? 'block' : 'none' }} 
           tabIndex={-1} 
           role="dialog">
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Filter Results</h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setShowFilterModal(false)}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <div className="mb-4">
                <label className="form-label">Authors</label>
                <div className="input-group mb-2">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search authors..."
                    value={authorSearch}
                    onChange={handleAuthorSearch}
                  />
                </div>
                {authorSearch && filteredAuthors.length > 0 && (
                  <div className="list-group mb-2">
                    {filteredAuthors.map(author => (
                      <button
                        key={author}
                        className="list-group-item list-group-item-action"
                        onClick={() => handleAuthorSelect(author)}
                      >
                        {author}
                      </button>
                    ))}
                  </div>
                )}
                {selectedAuthors.length > 0 && (
                  <div className="d-flex flex-wrap gap-2">
                    {selectedAuthors.map(author => (
                      <span key={author} className="badge bg-primary d-flex align-items-center">
                        {author}
                        <button
                          type="button"
                          className="btn-close btn-close-white ms-2"
                          onClick={() => handleAuthorRemove(author)}
                          aria-label="Remove"
                        ></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="form-label">Categories</label>
                <div className="category-filter-list border rounded p-2">
                  {CATEGORIES.map((category, index) => {
                    const checked = selectedCategories.includes(category);
                    const categoryId = `category-filter-${index}`;
                    return (
                      <div className="form-check mb-2" key={category}>
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={categoryId}
                          checked={checked}
                          onChange={() => handleCategoryToggle(category)}
                        />
                        <label className="form-check-label" htmlFor={categoryId}>
                          {category}
                        </label>
                      </div>
                    );
                  })}
                </div>
                <small className="text-muted d-block mt-1">
                  Trykk for å velge en eller flere kategorier.
                </small>
              </div>

              <div className="mb-4">
                <label className="form-label">Year Range: {yearRange[0]} - {yearRange[1]}</label>
                <div className="d-flex gap-3">
                  <div className="flex-grow-1">
                    <label className="form-label">From</label>
                    <input
                      type="range"
                      className="form-range"
                      min={MIN_YEAR}
                      max={MAX_YEAR}
                      value={yearRange[0]}
                      name="minYear"
                      onChange={handleYearRangeChange}
                    />
                  </div>
                  <div className="flex-grow-1">
                    <label className="form-label">To</label>
                    <input
                      type="range"
                      className="form-range"
                      min={MIN_YEAR}
                      max={MAX_YEAR}
                      value={yearRange[1]}
                      name="maxYear"
                      onChange={handleYearRangeChange}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowFilterModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Params Modal */}
      <div className={`modal fade ${showSearchParamsModal ? 'show' : ''}`}
           style={{ display: showSearchParamsModal ? 'block' : 'none' }}
           tabIndex={-1}
           role="dialog">
        <div className="modal-dialog" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Søkeparametre</h5>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowSearchParamsModal(false)}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Nærhetsvindu (window)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    step={1}
                    value={nearWindow}
                    onChange={(e) => setNearWindow(Number(e.target.value))}
                  />
                  <small className="text-muted">Maks avstand mellom søkegrupper i treff.</small>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Kontekst før (before)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    step={1}
                    value={beforeWindow}
                    onChange={(e) => setBeforeWindow(Number(e.target.value))}
                  />
                  <small className="text-muted">Antall ord (tokens) vist før treffet i utdraget.</small>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Kontekst etter (after)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    step={1}
                    value={afterWindow}
                    onChange={(e) => setAfterWindow(Number(e.target.value))}
                  />
                  <small className="text-muted">Antall ord (tokens) vist etter treffet i utdraget.</small>
                </div>
                <div className="col-md-6">
                  <label className="form-label">Samples per book</label>
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    step={1}
                    value={perBook}
                    onChange={(e) => setPerBook(Number(e.target.value))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">doc_samples (fallback)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    step={1}
                    value={docSamples}
                    onChange={(e) => setDocSamples(Number(e.target.value))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Maks visning (cutoff)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    step={1}
                    value={totalLimit}
                    onChange={(e) => setTotalLimit(Number(e.target.value))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Max variants (*)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    step={1}
                    value={maxVariants}
                    onChange={(e) => setMaxVariants(Number(e.target.value))}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">Term groups JSON (optional)</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder='[["spise","spiser","spiste"],["middag"]] or [spise, spiste] middag'
                    value={termGroupsInput}
                    onChange={(e) => setTermGroupsInput(e.target.value)}
                  />
                </div>
                <div className="col-12">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="symmetricSearchCheck"
                      checked={isSymmetric}
                      onChange={(e) => setIsSymmetric(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="symmetricSearchCheck">
                      Symmetric search window
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSearchParamsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      <div className={`modal fade ${showHelpModal ? 'show' : ''}`}
           style={{ display: showHelpModal ? 'block' : 'none' }}
           tabIndex={-1}
           role="dialog">
        <div className="modal-dialog" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Søkehjelp</h5>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowHelpModal(false)}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info py-2 mb-3">
                Skriv i søkefeltet og velg mellom <code>Konk</code> og <code>Tell</code> i knapperaden.
              </div>
              <div className="alert alert-light border py-2 mb-3">
                <strong>Hva kan jeg søke etter?</strong><br />
                <code>norge</code>, <code>norge sverige</code>, <code>"norge i krig"</code>, <code>elskov*</code>, <code>[elskov, kjærlighed] kvinne</code>, <code>#geo</code>, <code>#geo krig</code>, <code>#geo:"Rio de Janeiro"</code>, <code>#geo:1032414</code>.
              </div>
              <p><strong>Vanlig søk:</strong> skriv ett eller flere ord, for eksempel <code>elskov kjærlighed</code>. Flere ord uten anførselstegn blir behandlet som nærhetssøk.</p>
              <p><strong>Frasesøk:</strong> skriv uttrykket i anførselstegn, for eksempel <code>"i dag"</code> eller <code>"norge i krig"</code>. Da brukes <code>sequence</code> med eksakt rekkefølge.</p>
              <p><strong>Wildcard:</strong> bruk <code>*</code>, for eksempel <code>elskov*</code>.</p>
              <p><strong>Termgrupper:</strong> skriv grupper i søkefeltet, for eksempel <code>[spise, spiser] middag</code> eller <code>[krig, krigen] [skip, sjø]</code>. OR brukes inni gruppen, og AND mellom grupper.</p>
              <p><strong>Geo-søk:</strong> bruk <code>#geo</code> for alle stedstreff, <code>#geo krig</code> for geo + ord, <code>#geo:"Rio de Janeiro"</code> for navneoppslag via resolver, eller en NB-steds-id som <code>#geo:1032414</code>. Ved behov prøver appen også <code>#geo:nb:1032414</code>.</p>
              <p><strong>Resultatmodus:</strong> <code>Konk</code> viser konkordanser som kan klikkes for bokinfo og lenke til Nettbiblioteket. <code>Tell</code> viser raske totaler og dokumentdekning for flergruppesøk og geo-near.</p>
              <p><strong>Filtrering:</strong> bruk verktøy-ikonet for forfatter, kategori og år. Laster du opp et korpus, brukes det som dokumentfilter.</p>
              <p><strong>Søkeparametre:</strong> <code>window</code> er maks avstand mellom søkegrupper i trefflogikken. <code>before / after</code> er hvor mye kontekst som vises i utdraget.</p>
              <p><strong>Treffmengde:</strong> bruk <code>Samples per book</code>, <code>doc_samples</code> og <code>Maks visning</code> i verktøymenyen for å styre hvor mange treff Konk viser.</p>
              <p><strong>Store søk:</strong> Konk følger treffutvalget fra verktøymenyen, mens Tell kan gå bredere.</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowHelpModal(false)}
              >
                Lukk
              </button>
            </div>
          </div>
        </div>
      </div>

      {showModal && <div className="modal-backdrop fade show"></div>}
      {showFilterModal && <div className="modal-backdrop fade show"></div>}
      {showSearchParamsModal && <div className="modal-backdrop fade show"></div>}
      {showHelpModal && <div className="modal-backdrop fade show"></div>}
    </div>
  );
}

export default App; 