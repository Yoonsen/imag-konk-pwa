import { useId, useMemo, useRef, useState } from 'react';
import {
  Checkbox,
  Details,
  DetailsContent,
  DetailsSummary,
  Field,
  Label,
  Search,
  SearchButton,
  SearchInput,
  Select,
  SelectOption,
  Textfield
} from '@digdir/designsystemet-react';
import { formatSearchList, matchingSearchHistory, parsePastedSearchList } from '../lib/searchHistory';
import {
  PREVIEW_PROFILES,
  matchingPreviewProfile,
  type ResultMode
} from '../lib/searchRequests';

interface SearchPanelProps {
  query: string;
  resultMode: ResultMode;
  comparisonOptions: string[];
  selectedComparisonIndex: number;
  recentQueries: string[];
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onResultModeChange: (value: ResultMode) => void;
  onComparisonChange: (index: number) => void;
  onSelectRecentQuery: (value: string) => void;
  onImportQueries: (queries: string[]) => void;
  onRemoveRecentQuery: (value: string) => void;
  onClearRecentQueries: () => void;
  onSearch: () => void;
}

export function SearchPanel({
  query,
  resultMode,
  comparisonOptions,
  selectedComparisonIndex,
  recentQueries,
  isLoading,
  onQueryChange,
  onResultModeChange,
  onComparisonChange,
  onSelectRecentQuery,
  onImportQueries,
  onRemoveRecentQuery,
  onClearRecentQueries,
  onSearch
}: SearchPanelProps) {
  const showComparisonPicker = resultMode === 'render' && comparisonOptions.length > 1;
  const historyListId = useId();
  const historyRef = useRef<HTMLDivElement>(null);
  const queryFieldRef = useRef<HTMLDivElement>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isListFiltered, setIsListFiltered] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(-1);
  const visibleHistory = useMemo(
    () => (isListFiltered ? matchingSearchHistory(recentQueries, query) : recentQueries),
    [isListFiltered, query, recentQueries]
  );
  const historyVisible = isHistoryOpen;
  const activeHistoryId = historyVisible && activeHistoryIndex >= 0
    ? `${historyListId}-${activeHistoryIndex}`
    : undefined;

  const closeHistory = () => {
    setIsHistoryOpen(false);
    setIsPasteOpen(false);
    setIsListFiltered(false);
    setActiveHistoryIndex(-1);
  };

  const selectRecentQuery = (value: string) => {
    onSelectRecentQuery(value);
    closeHistory();
  };

  const addPastedQueries = () => {
    const incoming = parsePastedSearchList(pasteText);
    if (incoming.length === 0) return;
    onImportQueries(incoming);
    setPasteText('');
    setIsPasteOpen(false);
  };

  const copySearchList = async () => {
    const text = formatSearchList(recentQueries);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
    window.setTimeout(() => setCopyStatus('idle'), 1600);
  };

  const toggleHistory = () => {
    setIsHistoryOpen((open) => {
      if (open) {
        setIsPasteOpen(false);
        setIsListFiltered(false);
        setActiveHistoryIndex(-1);
      } else {
        setIsListFiltered(false);
      }
      return !open;
    });
  };

  return (
    <form
      className={`search-bar${showComparisonPicker ? ' search-bar--with-comparison' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        closeHistory();
        onSearch();
      }}
    >
      <div className="search-query-field" ref={queryFieldRef}>
        <Field>
          <div className="search-query-field__header">
            <Label>Søkeuttrykk</Label>
            <button
              type="button"
              className="search-history-toggle"
              aria-expanded={historyVisible}
              aria-controls={historyVisible ? historyListId : undefined}
              onClick={toggleHistory}
            >
              Liste
            </button>
          </div>
          <Search>
            <SearchInput
              name="query"
              value={query}
              autoComplete="off"
              role="combobox"
              aria-label="Søkeuttrykk"
              aria-autocomplete="list"
              aria-expanded={historyVisible}
              aria-controls={visibleHistory.length > 0 ? historyListId : undefined}
              aria-activedescendant={activeHistoryId}
              onChange={(event) => {
                onQueryChange(event.target.value);
                setIsHistoryOpen(true);
                setIsListFiltered(true);
                setActiveHistoryIndex(-1);
              }}
              onFocus={() => setIsHistoryOpen(true)}
              onClick={() => setIsHistoryOpen(true)}
              onBlur={() => {
                window.setTimeout(() => {
                  const active = document.activeElement;
                  if (queryFieldRef.current?.contains(active)) return;
                  if (historyRef.current?.contains(active)) return;
                  closeHistory();
                }, 0);
              }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (historyVisible) {
                  event.preventDefault();
                  closeHistory();
                }
                return;
              }

              if (visibleHistory.length === 0) return;

              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setIsHistoryOpen(true);
                setActiveHistoryIndex((current) => (
                  current < visibleHistory.length - 1 ? current + 1 : 0
                ));
                return;
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setIsHistoryOpen(true);
                setActiveHistoryIndex((current) => (
                  current <= 0 ? visibleHistory.length - 1 : current - 1
                ));
                return;
              }

              if (event.key === 'Enter' && historyVisible && activeHistoryIndex >= 0) {
                event.preventDefault();
                selectRecentQuery(visibleHistory[activeHistoryIndex]);
              }
            }}
          />
          <SearchButton type="submit" loading={isLoading}>Søk</SearchButton>
        </Search>
        </Field>
        {historyVisible ? (
          <div
            ref={historyRef}
            className="search-history"
            onMouseDown={(event) => {
              if ((event.target as HTMLElement).closest('textarea')) return;
              event.preventDefault();
            }}
          >
            {visibleHistory.length > 0 ? (
              <ul
                id={historyListId}
                className="search-history__list"
                role="listbox"
                aria-label="Søkeliste"
              >
                {visibleHistory.map((item, index) => (
                  <li key={item} className="search-history__row" role="presentation">
                    <button
                      id={`${historyListId}-${index}`}
                      type="button"
                      className={
                        index === activeHistoryIndex
                          ? 'search-history__item search-history__item--active'
                          : 'search-history__item'
                      }
                      role="option"
                      aria-selected={index === activeHistoryIndex}
                      title={item}
                      onClick={() => selectRecentQuery(item)}
                    >
                      {item}
                    </button>
                    <button
                      type="button"
                      className="search-history__remove"
                      aria-label={`Fjern ${item}`}
                      onClick={() => {
                        onRemoveRecentQuery(item);
                        setActiveHistoryIndex(-1);
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="search-history__empty">
                {recentQueries.length === 0
                  ? 'Ingen søk i listen ennå. Lim inn ett søk per linje.'
                  : 'Ingen treff i listen.'}
              </p>
            )}
            {isPasteOpen ? (
              <div className="search-history__paste">
                <textarea
                  className="search-history__paste-input"
                  aria-label="Lim inn søkeliste"
                  placeholder={'demokrati\nfrihet\n[elskov, kjærlighed] kvinne'}
                  rows={4}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                />
                <div className="search-history__actions">
                  <button type="button" className="search-history__action" onClick={addPastedQueries}>
                    Legg til
                  </button>
                  <button
                    type="button"
                    className="search-history__action"
                    onClick={() => {
                      setIsPasteOpen(false);
                      setPasteText('');
                    }}
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <div className="search-history__actions">
                <button
                  type="button"
                  className="search-history__action"
                  disabled={recentQueries.length === 0}
                  onClick={() => { void copySearchList(); }}
                >
                  {copyStatus === 'copied' ? 'Kopiert' : copyStatus === 'failed' ? 'Kopiering feilet' : 'Kopier liste'}
                </button>
                <button
                  type="button"
                  className="search-history__action"
                  onClick={() => setIsPasteOpen(true)}
                >
                  Lim inn liste
                </button>
                <button
                  type="button"
                  className="search-history__action"
                  disabled={recentQueries.length === 0}
                  onClick={() => {
                    onClearRecentQueries();
                    closeHistory();
                  }}
                >
                  Tøm
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <Field className="result-mode-field">
        <Label>Resultatvisning</Label>
        <Select
          value={resultMode}
          aria-label="Resultatvisning"
          onChange={(event) => onResultModeChange(event.target.value as ResultMode)}
        >
          <SelectOption value="render">Konk</SelectOption>
          <SelectOption value="count">Telling</SelectOption>
          <SelectOption value="year-count">Trend</SelectOption>
        </Select>
      </Field>

      {showComparisonPicker ? (
        <Field className="comparison-expression-field">
          <Label>Aktivt søk</Label>
          <Select
            aria-label="Aktivt søk"
            value={String(selectedComparisonIndex)}
            onChange={(event) => onComparisonChange(Number(event.target.value))}
          >
            {comparisonOptions.map((option, index) => (
              <SelectOption key={`${index}-${option}`} value={String(index)}>
                {option}
              </SelectOption>
            ))}
          </Select>
        </Field>
      ) : null}
    </form>
  );
}

interface SearchSettingsPanelProps {
  query: string;
  resultMode: ResultMode;
  perBook: number;
  docSamples: number;
  totalLimit: number;
  nearWindow: number;
  beforeWindow: number;
  afterWindow: number;
  maxVariants: number;
  termGroupsInput: string;
  isSymmetric: boolean;
  onPerBookChange: (value: number) => void;
  onDocSamplesChange: (value: number) => void;
  onTotalLimitChange: (value: number) => void;
  onNearWindowChange: (value: number) => void;
  onBeforeWindowChange: (value: number) => void;
  onAfterWindowChange: (value: number) => void;
  onMaxVariantsChange: (value: number) => void;
  onTermGroupsInputChange: (value: string) => void;
  onSymmetricChange: (value: boolean) => void;
}

export function SearchSettingsPanel({
  query,
  resultMode,
  perBook,
  docSamples,
  totalLimit,
  nearWindow,
  beforeWindow,
  afterWindow,
  maxVariants,
  termGroupsInput,
  isSymmetric,
  onPerBookChange,
  onDocSamplesChange,
  onTotalLimitChange,
  onNearWindowChange,
  onBeforeWindowChange,
  onAfterWindowChange,
  onMaxVariantsChange,
  onTermGroupsInputChange,
  onSymmetricChange
}: SearchSettingsPanelProps) {
  const showSampling = resultMode === 'render';
  const hasWildcard = query.includes('*');
  const activeProfile = matchingPreviewProfile(perBook, docSamples, totalLimit);

  return (
    <div className="settings-stack" aria-label="Parametre for neste søk">
      <p className="panel-intro">
        Feltene tilpasses {resultMode === 'render' ? 'samplede konkordanser' : resultMode === 'count' ? 'telling' : 'trend'}.
      </p>
      {showSampling ? (
        <>
          <fieldset className="profile-picker">
            <legend>Velg et utgangspunkt</legend>
            <div className="profile-picker__options">
              {PREVIEW_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className="profile-chip"
                  aria-pressed={activeProfile === profile.id}
                  title={profile.description}
                  onClick={() => {
                    onPerBookChange(profile.perBook);
                    onDocSamplesChange(profile.docSamples);
                    onTotalLimitChange(profile.totalLimit);
                  }}
                >
                  {profile.label}
                </button>
              ))}
            </div>
            <span className="profile-picker__description">
              {activeProfile
                ? PREVIEW_PROFILES.find((profile) => profile.id === activeProfile)?.description
                : 'Egendefinert utvalg'}
            </span>
          </fieldset>
          <Textfield
            label="Treff fra samme bok"
            description="Maks antall treff én bok kan bidra med i Konk-utvalget."
            type="number"
            min={1}
            max={20}
            value={perBook}
            onChange={(event) => onPerBookChange(Number(event.target.value))}
          />
          <Textfield
            label="Bøker i utvalget"
            description="Hvor mange bøker som undersøkes i den samplede forhåndsvisningen. 0 slår av dokument-sampling."
            type="number"
            min={0}
            value={docSamples}
            onChange={(event) => onDocSamplesChange(Number(event.target.value))}
          />
          <Textfield
            label="Treff i forhåndsvisning"
            description="Øvre radgrense i Konk, ikke det totale antallet treff."
            type="number"
            min={1}
            max={5000}
            value={totalLimit}
            onChange={(event) => onTotalLimitChange(Number(event.target.value))}
          />
        </>
      ) : null}
      <Textfield
        label="Avstand mellom søkeord"
        description="Største tillatte avstand mellom ord eller termgrupper."
        type="number"
        min={1}
        max={50}
        value={nearWindow}
        onChange={(event) => onNearWindowChange(Number(event.target.value))}
      />
      {showSampling ? (
        <div className="year-fields">
          <Textfield
            label="Ord før"
            description="Antall ord som vises før treffet."
            type="number"
            min={0}
            max={50}
            value={beforeWindow}
            onChange={(event) => onBeforeWindowChange(Number(event.target.value))}
          />
          <Textfield
            label="Ord etter"
            description="Antall ord som vises etter treffet."
            type="number"
            min={0}
            max={50}
            value={afterWindow}
            onChange={(event) => onAfterWindowChange(Number(event.target.value))}
          />
        </div>
      ) : null}
      {hasWildcard ? (
        <Textfield
          label="Wildcard-varianter"
          description="Maks antall ordformer som * kan utvides til."
          type="number"
          min={1}
          max={100}
          value={maxVariants}
          onChange={(event) => onMaxVariantsChange(Number(event.target.value))}
        />
      ) : null}
      <Details>
        <DetailsSummary>Hva påvirker parameterne?</DetailsSummary>
        <DetailsContent>
          <div className="parameter-guide">
            <p><strong>Subkorpuset</strong> bestemmer hvilke bøker som kan være med.</p>
            <p><strong>Bøker i utvalget</strong> lager en mindre, raskere Konk-forhåndsvisning av dette subkorpuset.</p>
            <p><strong>Treff fra samme bok</strong> hindrer at én bok dominerer utvalget.</p>
            <p><strong>Treff i forhåndsvisning</strong> begrenser radene på skjermen, ikke den faktiske tellingen.</p>
            <p>Telling og Trend bruker hele aktive subkorpus. Komplett CSV telles først og har et eget tak på 5 000 rader.</p>
          </div>
        </DetailsContent>
      </Details>
      <Details>
        <DetailsSummary>Avanserte søkevalg</DetailsSummary>
        <DetailsContent>
          <div className="settings-stack settings-stack--nested">
            {!hasWildcard ? (
              <Textfield
                label="Wildcard-varianter"
                description="Maks antall ordformer som * kan utvides til."
                type="number"
                min={1}
                max={100}
                value={maxVariants}
                onChange={(event) => onMaxVariantsChange(Number(event.target.value))}
              />
            ) : null}
            <Textfield
              label="Eksplisitte termgrupper"
              description='OR innen en gruppe, nærhetskrav mellom grupper. Eksempel: [["spise","spiser"],["middag"]]'
              multiline
              rows={3}
              value={termGroupsInput}
              onChange={(event) => onTermGroupsInputChange(event.target.value)}
            />
            <Checkbox
              label="Søk i begge retninger"
              description="Tillat treff på begge sider eller i begge rekkefølger rundt ankeret."
              checked={isSymmetric}
              onChange={(event) => onSymmetricChange(event.target.checked)}
            />
          </div>
        </DetailsContent>
      </Details>
    </div>
  );
}
