import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@digdir/designsystemet-react', () => {
  const wrapper = (tag: keyof React.JSX.IntrinsicElements) =>
    ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(tag, props, children);

  return {
    Button: wrapper('button'),
    Checkbox: ({ label, ...props }: { label: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) => (
      <label>{label}<input type="checkbox" {...props} /></label>
    ),
    Paragraph: wrapper('p'),
    Tag: wrapper('span'),
    Textfield: ({ label, ...props }: { label: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) => (
      <label>{label}<input {...props} /></label>
    )
  };
});

import { CorpusPanel } from './CorpusPanel';

const baseProps = {
  sourceLabel: 'ImagiNation-korpuset',
  hasUploadedCorpus: false,
  selectedDocuments: 100,
  totalDocuments: 22946,
  selectedAuthors: [] as string[],
  selectedCategories: ['All Categories'],
  categories: ['All Categories', 'dikt'],
  yearRange: [1800, 1920] as [number, number],
  fullYearRange: [1800, 1920] as [number, number],
  authorSearch: '',
  authorSuggestions: [] as string[],
  onAuthorSearchChange: vi.fn(),
  onAuthorSelect: vi.fn(),
  onAuthorRemove: vi.fn(),
  onCategoryToggle: vi.fn(),
  onYearChange: vi.fn(),
  onReset: vi.fn(),
  onUpload: vi.fn(),
  onClearUpload: vi.fn()
};

describe('CorpusPanel', () => {
  it('lets the user restore the default corpus after an upload', () => {
    const onClearUpload = vi.fn();
    render(
      <CorpusPanel
        {...baseProps}
        sourceLabel="Opplastet subkorpus"
        hasUploadedCorpus
        onClearUpload={onClearUpload}
      />
    );

    expect(screen.getAllByText('Opplastet subkorpus').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Tilbake til ImagiNation-korpuset' }));
    expect(onClearUpload).toHaveBeenCalledOnce();
  });

  it('hides the restore action on the default corpus', () => {
    render(<CorpusPanel {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Tilbake til ImagiNation-korpuset' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nullstill filtre' })).toBeInTheDocument();
  });
});
