import { Button, Checkbox, Paragraph, Tag, Textfield } from '@digdir/designsystemet-react';

interface CorpusPanelProps {
  sourceLabel: string;
  hasUploadedCorpus: boolean;
  selectedDocuments: number;
  totalDocuments: number;
  selectedAuthors: string[];
  selectedCategories: string[];
  categories: string[];
  yearRange: [number, number];
  fullYearRange: [number, number];
  authorSearch: string;
  authorSuggestions: string[];
  onAuthorSearchChange: (value: string) => void;
  onAuthorSelect: (author: string) => void;
  onAuthorRemove: (author: string) => void;
  onCategoryToggle: (category: string) => void;
  onYearChange: (boundary: 'min' | 'max', value: number) => void;
  onReset: () => void;
  onUpload: () => void;
  onClearUpload: () => void;
}

export function CorpusPanel({
  sourceLabel,
  hasUploadedCorpus,
  selectedDocuments,
  totalDocuments,
  selectedAuthors,
  selectedCategories,
  categories,
  yearRange,
  fullYearRange,
  authorSearch,
  authorSuggestions,
  onAuthorSearchChange,
  onAuthorSelect,
  onAuthorRemove,
  onCategoryToggle,
  onYearChange,
  onReset,
  onUpload,
  onClearUpload
}: CorpusPanelProps) {
  const selectedCategoryNames = selectedCategories.includes('All Categories')
    ? []
    : selectedCategories;
  const hasYearFilter =
    yearRange[0] !== fullYearRange[0] || yearRange[1] !== fullYearRange[1];

  return (
    <div className="settings-stack">
      <div className="corpus-panel__summary" aria-live="polite">
        <span className="field-caption">Aktiv kilde</span>
        <strong>{sourceLabel}</strong>
        <span>
          {selectedDocuments.toLocaleString('nb-NO')} av {totalDocuments.toLocaleString('nb-NO')} dokumenter
        </span>
      </div>

      <div className="chip-list" aria-label="Aktive korpusfiltre">
        {hasUploadedCorpus ? <Tag data-color="accent">Opplastet subkorpus</Tag> : null}
        {selectedAuthors.map((author) => (
          <Tag key={`author-${author}`} data-color="accent">{author}</Tag>
        ))}
        {selectedCategoryNames.map((category) => (
          <Tag key={`category-${category}`} data-color="brand1">{category}</Tag>
        ))}
        {hasYearFilter ? <Tag data-color="neutral">{yearRange[0]}–{yearRange[1]}</Tag> : null}
        {!hasUploadedCorpus && selectedAuthors.length === 0 && selectedCategoryNames.length === 0 && !hasYearFilter ? (
          <Tag data-color="neutral">Ingen ekstra filtre</Tag>
        ) : null}
      </div>

      <Button type="button" variant="secondary" onClick={onUpload}>
        Last opp korpusfil
      </Button>
      {hasUploadedCorpus ? (
        <Button type="button" variant="secondary" onClick={onClearUpload}>
          Tilbake til ImagiNation-korpuset
        </Button>
      ) : null}
      <Paragraph data-size="xs">
        CSV- eller Excel-filen må ha en kolonne med URN, dhlabid eller id. URN-er kobles automatisk til DHlab.
      </Paragraph>

      <section className="filter-section">
        <Textfield
          label="Finn forfatter"
          value={authorSearch}
          onChange={(event) => onAuthorSearchChange(event.target.value)}
        />
        {authorSearch && authorSuggestions.length > 0 ? (
          <div className="choice-list" aria-label="Forfatterforslag">
            {authorSuggestions.map((author) => (
              <button
                type="button"
                className="choice-button choice-button--compact"
                key={author}
                onClick={() => onAuthorSelect(author)}
              >
                {author}
              </button>
            ))}
          </div>
        ) : null}
        {selectedAuthors.length > 0 ? (
          <div className="chip-list">
            {selectedAuthors.map((author) => (
              <Button
                key={author}
                type="button"
                data-size="sm"
                variant="secondary"
                onClick={() => onAuthorRemove(author)}
              >
                {author} ×
              </Button>
            ))}
          </div>
        ) : null}
      </section>

      <details className="panel-details">
        <summary>Kategorier</summary>
        <div className="category-filter-list">
          {categories.map((category) => (
            <Checkbox
              key={category}
              label={category === 'All Categories' ? 'Alle kategorier' : category}
              checked={selectedCategories.includes(category)}
              onChange={() => onCategoryToggle(category)}
            />
          ))}
        </div>
      </details>

      <fieldset className="filter-section">
        <legend>Utgivelsesår</legend>
        <div className="year-fields">
          <Textfield
            label="Fra"
            type="number"
            min={fullYearRange[0]}
            max={yearRange[1]}
            value={yearRange[0]}
            onChange={(event) => onYearChange('min', Number(event.target.value))}
          />
          <Textfield
            label="Til"
            type="number"
            min={yearRange[0]}
            max={fullYearRange[1]}
            value={yearRange[1]}
            onChange={(event) => onYearChange('max', Number(event.target.value))}
          />
        </div>
      </fieldset>

      <Button type="button" variant="tertiary" onClick={onReset}>Nullstill filtre</Button>
      <Paragraph data-size="xs">Endringer brukes umiddelbart i neste søk og eksport.</Paragraph>
    </div>
  );
}
