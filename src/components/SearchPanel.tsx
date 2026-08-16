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
import {
  PREVIEW_PROFILES,
  matchingPreviewProfile,
  type ResultMode
} from '../lib/searchRequests';

interface SearchPanelProps {
  query: string;
  resultMode: ResultMode;
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onResultModeChange: (value: ResultMode) => void;
  onSearch: () => void;
}

export function SearchPanel({
  query,
  resultMode,
  isLoading,
  onQueryChange,
  onResultModeChange,
  onSearch
}: SearchPanelProps) {
  return (
    <form
      className="search-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <Field className="search-query-field">
        <Label>Søkeuttrykk</Label>
        <Search>
          <SearchInput
            name="query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            aria-label="Søkeuttrykk"
          />
          <SearchButton type="submit" loading={isLoading}>Søk</SearchButton>
        </Search>
      </Field>

      <Field className="result-mode-field">
        <Label>Resultatvisning</Label>
        <Select
          value={resultMode}
          onChange={(event) => onResultModeChange(event.target.value as ResultMode)}
        >
          <SelectOption value="render">Konk</SelectOption>
          <SelectOption value="count">Telling</SelectOption>
          <SelectOption value="year-count">Trend</SelectOption>
        </Select>
      </Field>
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
