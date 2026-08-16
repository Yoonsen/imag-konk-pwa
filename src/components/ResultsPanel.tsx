import type { ReactNode } from 'react';
import { Alert, Spinner } from '@digdir/designsystemet-react';

interface ResultsPanelProps {
  status: string;
  isLoading: boolean;
  children: ReactNode;
}

export function ResultsPanel({ status, isLoading, children }: ResultsPanelProps) {
  return (
    <section className="results-panel" aria-labelledby="results-heading">
      <div className="results-panel__header">
        <h2 id="results-heading">Resultater</h2>
        {isLoading ? <Spinner aria-label="Søker" data-size="sm" /> : null}
      </div>
      <Alert
        className="status-message"
        data-color={status.toLowerCase().includes('error') || status.toLowerCase().includes('feil') ? 'danger' : 'info'}
        aria-live="polite"
      >
        {status}
      </Alert>
      <div className="results-panel__content">{children}</div>
    </section>
  );
}
