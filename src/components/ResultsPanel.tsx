import type { ReactNode } from 'react';
import { Alert, Spinner } from '@digdir/designsystemet-react';

interface ResultsPanelProps {
  status: string;
  isLoading: boolean;
  children: ReactNode;
}

export function ResultsPanel({ status, isLoading, children }: ResultsPanelProps) {
  const isError = status.toLowerCase().includes('error') || status.toLowerCase().includes('feil');
  return (
    <section className="results-panel" aria-labelledby="results-heading">
      <div className="results-panel__header">
        <h2 id="results-heading">Resultater</h2>
        {isLoading ? <Spinner aria-label="Søker" data-size="sm" /> : null}
      </div>
      {isError ? (
        <Alert className="status-message" data-color="danger" aria-live="assertive">
          {status}
        </Alert>
      ) : (
        <p className="status-message status-message--quiet" aria-live="polite">{status}</p>
      )}
      <div className="results-panel__content">{children}</div>
    </section>
  );
}
