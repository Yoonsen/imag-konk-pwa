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
  isLoading: false,
  onQueryChange: vi.fn(),
  onResultModeChange: vi.fn(),
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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'count' } });
    expect(onResultModeChange).toHaveBeenCalledWith('count');
  });
});
