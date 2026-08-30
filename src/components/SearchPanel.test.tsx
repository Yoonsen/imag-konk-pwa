import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@digdir/designsystemet-react', () => {
  const wrapper = (tag: keyof React.JSX.IntrinsicElements) =>
    ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(tag, props, children);

  return {
    Card: wrapper('section'),
    CardBlock: wrapper('div'),
    Heading: ({ children, level = 2, ...props }: React.PropsWithChildren<{ level?: number }>) =>
      React.createElement(`h${level}`, props, children),
    Paragraph: wrapper('p'),
    Field: wrapper('div'),
    FieldDescription: wrapper('p'),
    Label: wrapper('label'),
    Search: wrapper('div'),
    SearchInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    SearchButton: ({ children, loading: _loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) =>
      <button {...props}>{children}</button>,
    Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
    SelectOption: (props: React.OptionHTMLAttributes<HTMLOptionElement>) => <option {...props} />,
    Textfield: ({ label, description: _description, multiline, ...props }: {
      label: React.ReactNode;
      description?: React.ReactNode;
      multiline?: boolean;
    } & React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
      <label>
        {label}
        {multiline ? <textarea {...props} /> : <input {...props} />}
      </label>
    ),
    Checkbox: ({ label, description: _description, ...props }: {
      label: React.ReactNode;
      description?: React.ReactNode;
    } & React.InputHTMLAttributes<HTMLInputElement>) => (
      <label>{label}<input type="checkbox" {...props} /></label>
    ),
    Details: wrapper('details'),
    DetailsSummary: wrapper('summary'),
    DetailsContent: wrapper('div')
  };
});

import { SearchPanel, SearchSettingsPanel } from './SearchPanel';

const baseSearchProps = {
  query: 'demokrati',
  resultMode: 'render' as const,
  comparisonOptions: [] as string[],
  selectedComparisonIndex: 0,
  isLoading: false,
  recentQueries: [] as string[],
  onQueryChange: vi.fn(),
  onResultModeChange: vi.fn(),
  onComparisonChange: vi.fn(),
  onSelectRecentQuery: vi.fn(),
  onImportQueries: vi.fn(),
  onRemoveRecentQuery: vi.fn(),
  onClearRecentQueries: vi.fn(),
  onSearch: vi.fn()
};

const baseSettingsProps = {
  query: 'demokrati',
  resultMode: 'render' as const,
  perBook: 3,
  docSamples: 50,
  totalLimit: 200,
  nearWindow: 5,
  beforeWindow: 15,
  afterWindow: 15,
  maxVariants: 10,
  termGroupsInput: '',
  isSymmetric: true,
  onPerBookChange: vi.fn(),
  onDocSamplesChange: vi.fn(),
  onTotalLimitChange: vi.fn(),
  onNearWindowChange: vi.fn(),
  onBeforeWindowChange: vi.fn(),
  onAfterWindowChange: vi.fn(),
  onMaxVariantsChange: vi.fn(),
  onTermGroupsInputChange: vi.fn(),
  onSymmetricChange: vi.fn()
};

describe('SearchPanel', () => {
  it('shows sampling controls only for concordance previews', () => {
    const { rerender } = render(<SearchSettingsPanel {...baseSettingsProps} />);
    expect(screen.getByLabelText('Treff fra samme bok')).toBeInTheDocument();
    expect(screen.getByLabelText('Bøker i utvalget')).toBeInTheDocument();

    rerender(<SearchSettingsPanel {...baseSettingsProps} resultMode="count" />);
    expect(screen.queryByLabelText('Treff fra samme bok')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Bøker i utvalget')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Avstand mellom søkeord')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rask sjekk' })).not.toBeInTheDocument();
  });

  it('applies a preview profile without changing other search settings', () => {
    const onPerBookChange = vi.fn();
    const onDocSamplesChange = vi.fn();
    const onTotalLimitChange = vi.fn();
    const onNearWindowChange = vi.fn();
    render(
      <SearchSettingsPanel
        {...baseSettingsProps}
        onPerBookChange={onPerBookChange}
        onDocSamplesChange={onDocSamplesChange}
        onTotalLimitChange={onTotalLimitChange}
        onNearWindowChange={onNearWindowChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Større utvalg' }));
    expect(onPerBookChange).toHaveBeenCalledWith(5);
    expect(onDocSamplesChange).toHaveBeenCalledWith(200);
    expect(onTotalLimitChange).toHaveBeenCalledWith(600);
    expect(onNearWindowChange).not.toHaveBeenCalled();
  });

  it('explains sampling separately from full counting and export', () => {
    render(<SearchSettingsPanel {...baseSettingsProps} />);
    expect(screen.getByText(/Telling og Trend bruker hele aktive subkorpus/)).toBeInTheDocument();
    expect(screen.getByText(/eget tak på 5 000 rader/)).toBeInTheDocument();
  });

  it('submits the search form accessibly', () => {
    const onSearch = vi.fn();
    render(<SearchPanel {...baseSearchProps} onSearch={onSearch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Søk' }));
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it('reports a changed result mode immediately', () => {
    const onResultModeChange = vi.fn();
    render(<SearchPanel {...baseSearchProps} onResultModeChange={onResultModeChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Resultatvisning' }), { target: { value: 'count' } });
    expect(onResultModeChange).toHaveBeenCalledWith('count');
  });

  it('shows comparison choices after mode and reports the selected concordance query', () => {
    const onComparisonChange = vi.fn();
    render(
      <SearchPanel
        {...baseSearchProps}
        comparisonOptions={['a', 'b']}
        onComparisonChange={onComparisonChange}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Aktivt søk' })).toBeInTheDocument();
    expect(screen.getByText('Aktivt søk')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Aktivt søk' }), { target: { value: '1' } });
    expect(onComparisonChange).toHaveBeenCalledWith(1);
  });

  it('hides comparison choices outside concordance mode', () => {
    render(
      <SearchPanel
        {...baseSearchProps}
        resultMode="count"
        comparisonOptions={['a', 'b']}
      />
    );
    expect(screen.getByRole('combobox', { name: 'Søkeuttrykk' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Resultatvisning' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Aktivt søk' })).not.toBeInTheDocument();
  });

  it('opens recent queries on focus and fills the field without searching', () => {
    const onSelectRecentQuery = vi.fn();
    const onSearch = vi.fn();
    render(
      <SearchPanel
        {...baseSearchProps}
        query=""
        recentQueries={['demokratiet', 'frihet gudsdyrkelse']}
        onSelectRecentQuery={onSelectRecentQuery}
        onSearch={onSearch}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    fireEvent.click(screen.getByRole('option', { name: 'demokratiet' }));

    expect(onSelectRecentQuery).toHaveBeenCalledWith('demokratiet');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('shows the full saved list from Liste even when the field already has a query', () => {
    render(
      <SearchPanel
        {...baseSearchProps}
        query="demokrati"
        recentQueries={['demokratiet', 'frihet gudsdyrkelse']}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    expect(screen.getByRole('option', { name: 'demokratiet' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'frihet gudsdyrkelse' })).toBeInTheDocument();
  });

  it('copies the stored search list to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <SearchPanel
        {...baseSearchProps}
        query=""
        recentQueries={['demokratiet', 'frihet']}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kopier liste' }));
    expect(writeText).toHaveBeenCalledWith('demokratiet\nfrihet');
  });

  it('imports a pasted list of queries without searching', () => {
    const onImportQueries = vi.fn();
    const onSearch = vi.fn();
    render(
      <SearchPanel
        {...baseSearchProps}
        query=""
        recentQueries={[]}
        onImportQueries={onImportQueries}
        onSearch={onSearch}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lim inn liste' }));
    fireEvent.change(screen.getByLabelText('Lim inn søkeliste'), {
      target: { value: 'norge\nsverige' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Legg til' }));

    expect(onImportQueries).toHaveBeenCalledWith(['norge', 'sverige']);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('can clear stored search history from the dropdown', () => {
    const onClearRecentQueries = vi.fn();
    render(
      <SearchPanel
        {...baseSearchProps}
        query=""
        recentQueries={['norge']}
        onClearRecentQueries={onClearRecentQueries}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tøm' }));
    expect(onClearRecentQueries).toHaveBeenCalledOnce();
  });

  it('removes one query from the list without searching', () => {
    const onRemoveRecentQuery = vi.fn();
    const onSelectRecentQuery = vi.fn();
    const onSearch = vi.fn();
    render(
      <SearchPanel
        {...baseSearchProps}
        query=""
        recentQueries={['demokratiet', 'frihet']}
        onRemoveRecentQuery={onRemoveRecentQuery}
        onSelectRecentQuery={onSelectRecentQuery}
        onSearch={onSearch}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fjern demokratiet' }));
    expect(onRemoveRecentQuery).toHaveBeenCalledWith('demokratiet');
    expect(onSelectRecentQuery).not.toHaveBeenCalled();
    expect(onSearch).not.toHaveBeenCalled();
  });
});
