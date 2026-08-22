import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@digdir/designsystemet-react', () => {
  const wrapper = (tag: keyof React.JSX.IntrinsicElements) =>
    ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(tag, props, children);
  return {
    Alert: wrapper('div'),
    Button: wrapper('button'),
    Paragraph: wrapper('p'),
    Spinner: wrapper('span'),
    Tag: wrapper('span')
  };
});

import { ExportPanel } from './ExportPanel';

const baseProps = {
  query: 'demokrati',
  selectedDocuments: 1200,
  previewRows: 20,
  estimatedTotal: 200,
  exportStatus: '',
  isExporting: false,
  canExport: true,
  onDownloadPreview: vi.fn(),
  onDownloadFull: vi.fn(),
  onDownloadTrendImage: vi.fn(),
  onCancelExport: vi.fn()
};

describe('ExportPanel', () => {
  it('offers the visible trend as a JPG', () => {
    render(<ExportPanel {...baseProps} contentType="trend" />);
    expect(screen.getByRole('button', { name: 'Last ned graf som JPG' })).toBeEnabled();
    expect(screen.queryByText('Last ned komplett CSV')).not.toBeInTheDocument();
  });

  it('keeps concordance download choices for concordance results', () => {
    render(<ExportPanel {...baseProps} contentType="concordance" />);
    expect(screen.getByRole('button', { name: 'Last ned samplet XLSX' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Last ned komplett CSV' })).toBeEnabled();
  });
});
