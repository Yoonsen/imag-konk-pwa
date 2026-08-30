const STORAGE_KEY = 'imagSearchHistory';
export const MAX_SEARCH_HISTORY = 50;

type HistoryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const memoryStore = new Map<string, string>();
const memoryStorage: HistoryStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: (key) => {
    memoryStore.delete(key);
  }
};

function getStorage(): HistoryStorage {
  const candidate = typeof window === 'undefined' ? null : window.localStorage;
  if (
    candidate &&
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
  ) {
    return candidate;
  }
  return memoryStorage;
}

export function isMemorableQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length > 0 && !/^:debug\b/i.test(trimmed);
}

export function loadSearchHistory(): string[] {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeSearchList(parsed);
  } catch {
    return [];
  }
}

export function saveSearchHistory(history: string[]): void {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_SEARCH_HISTORY)));
  } catch {
    // Ignore quota or private-mode failures.
  }
}

export function rememberSearchQuery(query: string, history: string[]): string[] {
  return importSearchQueries([query], history);
}

export function importSearchQueries(incoming: string[], history: string[]): string[] {
  const uniqueIncoming: string[] = [];
  for (const query of incoming) {
    const trimmed = query.trim();
    if (!isMemorableQuery(trimmed) || uniqueIncoming.includes(trimmed)) continue;
    uniqueIncoming.push(trimmed);
  }
  const next = [
    ...uniqueIncoming,
    ...history.filter((item) => !uniqueIncoming.includes(item))
  ].slice(0, MAX_SEARCH_HISTORY);
  saveSearchHistory(next);
  return next;
}

export function clearSearchHistory(): string[] {
  saveSearchHistory([]);
  return [];
}

export function formatSearchList(history: string[]): string {
  return history.join('\n');
}

export function parsePastedSearchList(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const first = lines[0];
  const last = lines[lines.length - 1];
  const looksLikeMultilineSingle =
    lines.length > 1 && (
      (first.startsWith('[') && !first.endsWith(']') && last.endsWith(']')) ||
      (first.startsWith('{') && !first.endsWith('}') && last.endsWith('}'))
    );

  if (looksLikeMultilineSingle) {
    const joined = lines.join(' ').trim();
    return isMemorableQuery(joined) ? [joined] : [];
  }

  return normalizeSearchList(lines);
}

export function matchingSearchHistory(history: string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return history;
  return history.filter((item) => item.toLowerCase().includes(needle));
}

function normalizeSearchList(items: unknown[]): string[] {
  return items
    .filter((item): item is string => typeof item === 'string' && isMemorableQuery(item))
    .map((item) => item.trim())
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, MAX_SEARCH_HISTORY);
}
