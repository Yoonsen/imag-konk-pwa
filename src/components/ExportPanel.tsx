import { Alert, Button, Paragraph, Spinner, Tag } from '@digdir/designsystemet-react';
import { FULL_EXPORT_LIMIT } from '../lib/searchRequests';

interface ExportPanelProps {
  contentType: 'trend' | 'concordance' | 'none';
  query: string;
  selectedDocuments: number;
  previewRows: number;
  estimatedTotal: number | null;
  exportStatus: string;
  isExporting: boolean;
  canExport: boolean;
  onDownloadPreview: () => void;
  onDownloadFull: () => void;
  onDownloadTrendImage: () => void;
  onCancelExport: () => void;
}

export function ExportPanel({
  contentType,
  query,
  selectedDocuments,
  previewRows,
  estimatedTotal,
  exportStatus,
  isExporting,
  canExport,
  onDownloadPreview,
  onDownloadFull,
  onDownloadTrendImage,
  onCancelExport
}: ExportPanelProps) {
  const overLimit = estimatedTotal !== null && estimatedTotal > FULL_EXPORT_LIMIT;
  const statusMessage = exportStatus ? (
    <Alert data-color={exportStatus.toLowerCase().includes('feil') ? 'danger' : 'info'} aria-live="polite">
      {isExporting ? <Spinner aria-label="Eksporterer" data-size="sm" /> : null}
      <Paragraph data-size="sm">{exportStatus}</Paragraph>
    </Alert>
  ) : null;

  if (contentType === 'trend') {
    return (
      <div className="settings-stack">
        <Paragraph data-size="sm" className="panel-intro">
          Last ned trendgrafen slik den vises nå, med valgt skala, glatting og punktvisning.
        </Paragraph>
        <div className="export-summary">
          <div>
            <span className="field-caption">Søkeuttrykk</span>
            <strong>{query.trim()}</strong>
          </div>
          <div>
            <span className="field-caption">Aktivt subkorpus</span>
            <strong>{selectedDocuments.toLocaleString('nb-NO')} dokumenter</strong>
          </div>
        </div>
        <div className="chip-list export-limits" aria-label="Eksportformat">
          <Tag data-color="neutral">JPG</Tag>
          <Tag data-color="neutral">Egnet for presentasjoner</Tag>
        </div>
        {statusMessage}
        <Button type="button" onClick={onDownloadTrendImage} disabled={isExporting}>
          Last ned graf som JPG
        </Button>
      </div>
    );
  }

  if (contentType === 'none') {
    return (
      <div className="settings-stack">
        <Paragraph data-size="sm" className="panel-intro">
          Vis en trendgraf eller konkordanser for å få relevante eksportvalg.
        </Paragraph>
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <Paragraph data-size="sm" className="panel-intro">
        Last ned forhåndsvisningen, eller hent et komplett CSV-sett når søket har høyst 5 000 treff.
      </Paragraph>
      <div className="export-summary">
        <div>
          <span className="field-caption">Søkeuttrykk</span>
          <strong>{query.trim() || 'Kjør et søk først'}</strong>
        </div>
        <div>
          <span className="field-caption">Aktivt subkorpus</span>
          <strong>{selectedDocuments.toLocaleString('nb-NO')} dokumenter</strong>
        </div>
        <div>
          <span className="field-caption">Forhåndsvisning</span>
          <strong>{previewRows.toLocaleString('nb-NO')} rader</strong>
        </div>
        <div>
          <span className="field-caption">Telling før full eksport</span>
          <strong>{estimatedTotal === null ? 'Kjøres automatisk' : estimatedTotal.toLocaleString('nb-NO')}</strong>
        </div>
      </div>

      <div className="chip-list export-limits" aria-label="Eksportgrenser">
        <Tag data-color="neutral">CSV</Tag>
        <Tag data-color="neutral">Maks {FULL_EXPORT_LIMIT.toLocaleString('nb-NO')} rader</Tag>
        <Tag data-color="neutral">Samme subkorpus og søkeparametre</Tag>
      </div>

      {overLimit ? (
        <Alert data-color="warning">
          Søket har flere enn {FULL_EXPORT_LIMIT.toLocaleString('nb-NO')} treff. Snevre inn søket eller subkorpuset før du eksporterer.
        </Alert>
      ) : null}
      {statusMessage}

      <div className="button-row">
        <Button
          type="button"
          variant="secondary"
          onClick={onDownloadPreview}
          disabled={previewRows === 0 || isExporting}
        >
          Last ned samplet XLSX
        </Button>
        <Button
          type="button"
          onClick={onDownloadFull}
          disabled={!canExport || overLimit || isExporting}
        >
          Last ned komplett CSV
        </Button>
        {isExporting ? (
          <Button type="button" variant="tertiary" onClick={onCancelExport}>
            Avbryt
          </Button>
        ) : null}
      </div>
    </div>
  );
}
