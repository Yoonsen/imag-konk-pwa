import React, { useState, useEffect, useRef } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBlock,
  Heading,
  Paragraph
} from '@digdir/designsystemet-react';
import './App.css';
import * as XLSX from 'xlsx';
import DOMPurify from 'dompurify';
import { CorpusPanel } from './components/CorpusPanel';
import { ExportPanel } from './components/ExportPanel';
import { PanelRail, type WorkspacePanelId } from './components/PanelRail';
import { ResultsPanel } from './components/ResultsPanel';
import { SearchPanel, SearchSettingsPanel } from './components/SearchPanel';
import { WorkspacePanel } from './components/WorkspacePanel';
import {
  FULL_EXPORT_LIMIT,
  MAX_COMPARISON_TERMS,
  buildCountRequest,
  buildCorpusTokenStatsRequest,
  buildFullExportRequest,
  isExportWithinLimit,
  isObviouslyBroadExportQuery,
  normalizeSearchParameters,
  type CorpusTokenStatsResponse,
  type ResultMode
} from './lib/searchRequests';
import {
  clearSearchHistory,
  importSearchQueries,
  loadSearchHistory,
  rememberSearchQuery
} from './lib/searchHistory';
import {
  parseComparisonExpressions,
  parseTermGroups,
  toSingleTermGroups
} from './lib/searchSyntax';
import {
  downloadCsv,
  safeFilenamePart,
  type ConcordanceExportRow
} from './lib/csvExport';
import { downloadTrendChartJpeg } from './lib/chartExport';
import {
  normalizeUrn,
  resolveDhlabMetadata,
  resolveDhlabMetadataByIds
} from './lib/dhlabMetadata';
import {
  formatTrendValue,
  relativeFrequencyUnit,
  scaleComparisonTrendSeries,
  scaleSingleTrendRows,
  smoothComparisonTrendSeries,
  smoothSingleTrendRows,
  type TrendScaleMode,
  type TrendSmoothingMode
} from './lib/trendScaling';
import packageMetadata from '../package.json';

interface Metadata {
  id: number;
  urn: string;
  title?: string;
  author?: string;
  year?: number | string;
  category?: string;
}

interface ConcordanceRow {
  bookId: number;
  pos?: number;
  frag?: string;
  fragRaw?: string;
  fragHtml?: string;
  seqStart?: number;
  tokenLen?: number;
  surfaceText?: string;
  place?: {
    canonicalName?: string;
    geonamesId?: number | string;
    lat?: number | string;
    lon?: number | string;
    country?: string;
    variantText?: string;
  };
}

interface RenderedConcordanceRow {
  bookId: number;
  pos?: number;
  frag?: string;
}

interface ConcordanceResponse {
  rows: ConcordanceRow[];
  rendered?: RenderedConcordanceRow[];
}

interface CountResponse {
  total?: number;
  docs?: number;
}

interface YearCountRow {
  year: number;
  total?: number;
  docs?: number;
  filterDocs?: number;
  responseMs?: number;
}

interface YearCountResponse {
  rows?: YearCountRow[];
}

interface TrendComparisonSeries {
  term: string;
  rows: YearCountRow[];
}

interface TrendComparisonHover {
  term: string;
  row: YearCountRow;
}

interface PlaceResolverMatch {
  id: string;
  canonicalName?: string;
  matchedForm?: string;
  alternateForms?: string[];
  lat?: number | string;
  lon?: number | string;
  country?: string;
  matchType?: string;
}

interface PlaceResolverResponse {
  matches?: PlaceResolverMatch[];
}

interface RenderResultContext {
  trimmedQuery: string;
  normalizedBefore: number;
  normalizedAfter: number;
  normalizedNearWindow: number;
  extraGeoTermsText: string | null;
}

interface SearchOverrides {
  query?: string;
  resultMode?: ResultMode;
  yearRange?: [number, number];
  comparisonIndex?: number;
}

interface ModalData {
  title: string;
  author: string;
  year: string;
  category: string;
  dhlabid: string;
  link: string;
}

const CATEGORIES = [
  "All Categories",
  "Barnelitteratur",
  "Biografi / memoar",
  "Diktning: Dramatikk",
  "Diktning: Dramatikk # Diktning: oversatt",
  "Diktning: Epikk",
  "Diktning: Epikk # Diktning: oversatt",
  "Diktning: Lyrikk",
  "Diktning: Lyrikk # Diktning: oversatt",
  "Diverse",
  "Filosofi / estetikk / språk",
  "Historie / geografi",
  "Lesebok / skolebøker / pedagogikk",
  "Litteraturhistorie / litteraturkritikk",
  "Naturvitenskap / medisin",
  "Reiselitteratur",
  "Religiøse / oppbyggelige tekster",
  "Samfunn / politikk / juss",
  "Skisser / epistler / brev / essay / kåseri",
  "Taler / sanger / leilighetstekster",
  "Teknologi / håndverk / landbruk / havbruk"
];

const MIN_YEAR = 1814;
const MAX_YEAR = 1905;
const PLACE_RESOLVER_URL = 'https://api.nb.no/dhlab/imag/api/place/resolve';

const numberFormatter = new Intl.NumberFormat('nb-NO');
const TREND_COLORS = ['#1f6663', '#a34f2a', '#385f9d', '#8a5a91', '#847018', '#3d7a45', '#a33d62', '#59636b'];
const APP_VERSION = packageMetadata.version;
const APP_COMMIT = (import.meta.env.VITE_APP_COMMIT || 'local').slice(0, 7);

function buildYearCountResults(
  yearRows: YearCountRow[],
  lineYearRows: YearCountRow[],
  onYearSelect?: (year: number, span: 'exact' | 'window5') => void,
  activeYear?: YearCountRow | null,
  onPointActivate?: (row: YearCountRow) => void,
  onPointDismiss?: () => void,
  scaleMode: TrendScaleMode = 'absolute',
  smoothingMode: TrendSmoothingMode = 'five-year',
  showPoints = true
): React.ReactNode {
  const rows = yearRows
    .filter((row) => Number.isFinite(row.year))
    .map((row) => ({
      year: Math.trunc(row.year),
      total: typeof row.total === 'number' ? row.total : 0,
      docs: typeof row.docs === 'number' ? row.docs : 0,
      filterDocs: typeof row.filterDocs === 'number' ? row.filterDocs : 0
    }))
    .sort((a, b) => a.year - b.year);
  const lineRows = lineYearRows
    .filter((row) => Number.isFinite(row.year))
    .map((row) => ({
      year: Math.trunc(row.year),
      total: typeof row.total === 'number' ? row.total : 0
    }))
    .sort((a, b) => a.year - b.year);

  if (rows.length === 0) {
    return <p key="no-year-results">No yearly counts found for this query.</p>;
  }

  const totalMatches = rows.reduce((sum, row) => sum + row.total, 0);
  const summaryValue = scaleMode === 'absolute' ? totalMatches : totalMatches / rows.length;
  const peakRow = rows.reduce((peak, row) => (row.total > peak.total ? row : peak), rows[0]);
  const yearsWithHits = rows.filter((row) => row.total > 0).length;
  const minYear = rows[0].year;
  const maxYear = rows[rows.length - 1].year;
  const width = 720;
  const height = 240;
  const padding = { top: 16, right: 16, bottom: 32, left: 76 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxTotal = Math.max(
    ...rows.map((row) => row.total),
    ...lineRows.map((row) => row.total),
    1
  );
  const relativeUnit = relativeFrequencyUnit([
    ...rows.map((row) => row.total),
    ...lineRows.map((row) => row.total)
  ]);
  const formatValue = (value: number) => formatTrendValue(value, scaleMode, relativeUnit);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: maxTotal * ratio,
    y: padding.top + plotHeight - ratio * plotHeight
  }));
  const points = rows.map((row) => {
    const x = rows.length === 1 || minYear === maxYear
      ? padding.left + plotWidth / 2
      : padding.left + ((row.year - minYear) / (maxYear - minYear)) * plotWidth;
    const y = padding.top + plotHeight - (row.total / maxTotal) * plotHeight;
    return { ...row, x, y };
  });
  const linePoints = lineRows.map((row) => {
    const x = minYear === maxYear
      ? padding.left + plotWidth / 2
      : padding.left + ((row.year - minYear) / (maxYear - minYear)) * plotWidth;
    const y = padding.top + plotHeight - (row.total / maxTotal) * plotHeight;
    return { ...row, x, y };
  });
  const polylinePoints = linePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const axisLabelIndexes = Array.from(new Set([
    0,
    Math.floor((rows.length - 1) / 2),
    rows.length - 1
  ])).sort((a, b) => a - b);

  return (
    <div className="year-count-results">
      <div className="year-count-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Årlig telling">
          {yTicks.map((tick) => (
            <g key={`year-y-tick-${tick.ratio}`}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={padding.left + plotWidth}
                y2={tick.y}
                stroke={tick.ratio === 0 ? '#adb5bd' : '#dfe3e0'}
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#6c757d"
              >
                {formatValue(tick.value)}
              </text>
            </g>
          ))}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + plotHeight}
            stroke="#adb5bd"
            strokeWidth="1"
          />
          {polylinePoints ? (
            <polyline
              fill="none"
              stroke="#0d6efd"
              strokeWidth={smoothingMode === 'five-year' ? 3 : 2.5}
              points={polylinePoints}
            />
          ) : null}
          {showPoints ? points.map((point) => (
            <circle
              key={`year-point-${point.year}`}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="#0d6efd"
              opacity={smoothingMode === 'five-year' ? 0.42 : 1}
              style={onPointActivate ? { cursor: 'pointer' } : undefined}
              onClick={onPointActivate ? () => onPointActivate(point) : undefined}
              onKeyDown={onPointActivate ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onPointActivate(point);
                }
              } : undefined}
              tabIndex={onPointActivate ? 0 : -1}
            >
              <title>
                {onYearSelect
                  ? `${point.year}: ${formatValue(point.total)}. Velg punktet for konkordanser.`
                  : `${point.year}: ${formatValue(point.total)}`}
              </title>
            </circle>
          )) : null}
          {axisLabelIndexes.map((index) => {
            const point = points[index];
            return (
              <text
                key={`year-axis-${point.year}`}
                x={point.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="12"
                fill="#6c757d"
              >
                {point.year}
              </text>
            );
          })}
        </svg>
      </div>

      <div className="year-count-summary">
        <div className="year-count-card">
          <strong>{scaleMode === 'absolute' ? 'Total treff' : 'Gjennomsnitt per år'}</strong>
          <span>{formatValue(summaryValue)}</span>
        </div>
        <div className="year-count-card">
          <strong>{scaleMode === 'absolute' ? 'År med flest treff' : 'Høyeste år'}</strong>
          <span>{peakRow.year}: {formatValue(peakRow.total)}</span>
        </div>
        <div className="year-count-card">
          <strong>År med treff</strong>
          <span>{numberFormatter.format(yearsWithHits)}</span>
        </div>
      </div>

      {activeYear && onYearSelect && onPointDismiss ? (
        <Dialog open onClose={onPointDismiss} closedby="any" className="trend-point-dialog">
          <DialogBlock>
            <Heading level={2} data-size="sm">{activeYear.year}</Heading>
            <Paragraph>
              {formatValue(activeYear.total ?? 0)}
              {scaleMode === 'absolute' ? ' treff' : ''}
              {typeof activeYear.docs === 'number' ? ` i ${numberFormatter.format(activeYear.docs)} dokumenter` : ''}
            </Paragraph>
          </DialogBlock>
          <DialogBlock className="year-count-action-buttons">
            <Button
              type="button"
              data-size="sm"
              variant="secondary"
              onClick={() => onYearSelect(activeYear.year, 'exact')}
            >
              Dette året
            </Button>
            <Button
              type="button"
              data-size="sm"
              variant="tertiary"
              onClick={() => onYearSelect(activeYear.year, 'window5')}
              title={`Vis konkordanser for ${activeYear.year - 5} til ${activeYear.year + 5}`}
            >
              +/- 5 år
            </Button>
          </DialogBlock>
        </Dialog>
      ) : null}

      <div className="year-count-note">
        {scaleMode === 'relative'
          ? relativeUnit === 'percent'
            ? 'Kurven viser treff som prosent av tokenmengden.'
            : 'Kurven viser treff per million token (ppm).'
          : 'Kurven viser hvordan treffene fordeler seg over tid.'}
        {smoothingMode === 'five-year'
          ? showPoints
            ? ' Linjen er et sentrert femårsvindu; punktene viser faktiske år.'
            : ' Linjen er et sentrert femårsvindu.'
          : ''}
        {onYearSelect && showPoints ? ' Velg et punkt for å åpne konkordanser fra året.' : ''}
      </div>
    </div>
  );
}

function buildComparisonYearCountResults(
  comparisonSeries: TrendComparisonSeries[],
  comparisonLineSeries: TrendComparisonSeries[],
  activePoint: TrendComparisonHover | null,
  onPointActivate: (term: string, row: YearCountRow) => void,
  onPointDismiss: () => void,
  onYearSelect: (term: string, year: number, span: 'exact' | 'window5') => void,
  scaleMode: TrendScaleMode,
  smoothingMode: TrendSmoothingMode,
  showPoints: boolean,
  limitationNotice?: string,
  hiddenTerms: ReadonlySet<string> = new Set(),
  onToggleTerm?: (term: string) => void
): React.ReactNode {
  const normalizedSeries = comparisonSeries.map((series, index) => ({
    ...series,
    color: TREND_COLORS[index % TREND_COLORS.length],
    rows: series.rows
      .filter((row) => Number.isFinite(row.year))
      .map((row) => ({
        year: Math.trunc(row.year),
        total: typeof row.total === 'number' ? row.total : 0,
        docs: typeof row.docs === 'number' ? row.docs : 0,
        filterDocs: typeof row.filterDocs === 'number' ? row.filterDocs : 0
      }))
      .sort((a, b) => a.year - b.year)
  }));
  const normalizedLineSeries = comparisonLineSeries.map((series) => ({
    ...series,
    rows: series.rows
      .filter((row) => Number.isFinite(row.year))
      .map((row) => ({
        year: Math.trunc(row.year),
        total: typeof row.total === 'number' ? row.total : 0
      }))
      .sort((a, b) => a.year - b.year)
  }));
  const visibleSeries = normalizedSeries.filter((series) => !hiddenTerms.has(series.term));
  const visibleLineSeries = normalizedLineSeries.filter((series) => !hiddenTerms.has(series.term));
  const allRows = [
    ...normalizedSeries.flatMap((series) => series.rows),
    ...normalizedLineSeries.flatMap((series) => series.rows)
  ];
  const visibleRows = [
    ...visibleSeries.flatMap((series) => series.rows),
    ...visibleLineSeries.flatMap((series) => series.rows)
  ];

  if (allRows.length === 0) {
    return <p key="no-comparison-year-results">Ingen årlige tellinger funnet.</p>;
  }

  const width = 720;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 32, left: 76 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const minYear = Math.min(...allRows.map((row) => row.year));
  const maxYear = Math.max(...allRows.map((row) => row.year));
  const maxTotal = Math.max(...visibleRows.map((row) => row.total), 1);
  const relativeUnit = relativeFrequencyUnit(
    (visibleRows.length > 0 ? visibleRows : allRows).map((row) => row.total)
  );
  const formatValue = (value: number) => formatTrendValue(value, scaleMode, relativeUnit);
  const xForYear = (year: number) => minYear === maxYear
    ? padding.left + plotWidth / 2
    : padding.left + ((year - minYear) / (maxYear - minYear)) * plotWidth;
  const yForTotal = (total: number) => padding.top + plotHeight - (total / maxTotal) * plotHeight;
  const axisYears = Array.from(new Set([minYear, Math.round((minYear + maxYear) / 2), maxYear]));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: maxTotal * ratio,
    y: padding.top + plotHeight - ratio * plotHeight
  }));

  return (
    <div className="year-count-results">
      {limitationNotice ? (
        <div className="year-count-note"><strong>Merk:</strong> {limitationNotice}</div>
      ) : null}

      <div className="year-count-legend" aria-label="Trendlinjer. Klikk for å vise eller skjule en kurve.">
        {normalizedSeries.map((series) => {
          const isHidden = hiddenTerms.has(series.term);
          return (
            <button
              key={`legend-${series.term}`}
              type="button"
              className={isHidden ? 'year-count-legend__item year-count-legend__item--off' : 'year-count-legend__item'}
              aria-pressed={!isHidden}
              onClick={() => onToggleTerm?.(series.term)}
            >
              <i style={{ backgroundColor: series.color }} aria-hidden="true" />
              {series.term}
            </button>
          );
        })}
      </div>

      <div className="year-count-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sammenlignede årlige tellinger">
          {yTicks.map((tick) => (
            <g key={`comparison-y-tick-${tick.ratio}`}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={padding.left + plotWidth}
                y2={tick.y}
                stroke={tick.ratio === 0 ? '#adb5bd' : '#dfe3e0'}
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#6c757d"
              >
                {formatValue(tick.value)}
              </text>
            </g>
          ))}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + plotHeight}
            stroke="#adb5bd"
            strokeWidth="1"
          />
          {visibleSeries.map((series) => {
            const points = series.rows.map((row) => ({
              ...row,
              x: xForYear(row.year),
              y: yForTotal(row.total)
            }));
            const linePoints = (normalizedLineSeries.find((item) => item.term === series.term)?.rows ?? [])
              .map((row) => ({
                ...row,
                x: xForYear(row.year),
                y: yForTotal(row.total)
              }));
            return (
              <g key={`series-${series.term}`}>
                <polyline
                  fill="none"
                  stroke={series.color}
                  strokeWidth={smoothingMode === 'five-year' ? 3 : 2.5}
                  points={linePoints.map((point) => `${point.x},${point.y}`).join(' ')}
                />
                {showPoints ? points.map((point) => (
                  <circle
                    key={`${series.term}-${point.year}`}
                    cx={point.x}
                    cy={point.y}
                    r="3.5"
                    fill={series.color}
                    opacity={smoothingMode === 'five-year' ? 0.42 : 1}
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onPointActivate(series.term, point)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onPointActivate(series.term, point);
                      }
                    }}
                  >
                    <title>{series.term}, {point.year}: {formatValue(point.total)}</title>
                  </circle>
                )) : null}
              </g>
            );
          })}
          {axisYears.map((year) => (
            <text
              key={`comparison-axis-${year}`}
              x={xForYear(year)}
              y={height - 8}
              textAnchor="middle"
              fontSize="12"
              fill="#6c757d"
            >
              {year}
            </text>
          ))}
        </svg>
      </div>

      <div className="year-count-summary">
        {visibleSeries.map((series) => {
          const total = series.rows.reduce((sum, row) => sum + row.total, 0);
          const summaryValue = scaleMode === 'absolute' ? total : total / Math.max(series.rows.length, 1);
          const peak = series.rows.reduce<typeof series.rows[number] | null>(
            (current, row) => !current || row.total > current.total ? row : current,
            null
          );
          return (
            <div className="year-count-card" key={`summary-${series.term}`}>
              <strong>{series.term}</strong>
              <span>{formatValue(summaryValue)}{scaleMode === 'absolute' ? ' treff' : ' i snitt'}</span>
              {peak ? <small>Topp {peak.year}: {formatValue(peak.total)}</small> : null}
            </div>
          );
        })}
      </div>

      {activePoint && !hiddenTerms.has(activePoint.term) ? (
        <Dialog open onClose={onPointDismiss} closedby="any" className="trend-point-dialog">
          <DialogBlock>
            <Heading level={2} data-size="sm">{activePoint.term}, {activePoint.row.year}</Heading>
            <Paragraph>
              {formatValue(activePoint.row.total ?? 0)}
              {scaleMode === 'absolute' ? ' treff' : ''}
            </Paragraph>
          </DialogBlock>
          <DialogBlock className="year-count-action-buttons">
            <Button
              type="button"
              data-size="sm"
              variant="secondary"
              onClick={() => onYearSelect(activePoint.term, activePoint.row.year, 'exact')}
            >
              Dette året
            </Button>
            <Button
              type="button"
              data-size="sm"
              variant="tertiary"
              onClick={() => onYearSelect(activePoint.term, activePoint.row.year, 'window5')}
            >
              +/- 5 år
            </Button>
          </DialogBlock>
        </Dialog>
      ) : null}

      <div className="year-count-note">
        {scaleMode === 'relative'
          ? relativeUnit === 'percent'
            ? 'Linjene viser treff som prosent av tokenmengden på samme skala.'
            : 'Linjene viser treff per million token (ppm) på samme skala.'
          : scaleMode === 'cohort'
            ? 'Linjene viser hvert ords andel av de sammenlignede ordene per år.'
            : 'Linjene bruker samme absolutte skala.'}
        {smoothingMode === 'five-year'
          ? showPoints
            ? ' Linjene bruker et sentrert femårsvindu; punktene viser faktiske år.'
            : ' Linjene bruker et sentrert femårsvindu.'
          : ''}
        {showPoints ? ' Velg et punkt for å åpne konkordanser for ordet og året.' : ''}
      </div>
    </div>
  );
}

function TrendScaleControl({
  mode,
  smoothingMode,
  showPoints,
  hasComparison,
  tokenStatsStatus,
  onChange,
  onSmoothingChange,
  onShowPointsChange
}: {
  mode: TrendScaleMode;
  smoothingMode: TrendSmoothingMode;
  showPoints: boolean;
  hasComparison: boolean;
  tokenStatsStatus: 'loading' | 'ready' | 'error';
  onChange: (mode: TrendScaleMode) => void;
  onSmoothingChange: (mode: TrendSmoothingMode) => void;
  onShowPointsChange: (show: boolean) => void;
}) {
  const relativeDisabled = tokenStatsStatus !== 'ready';
  return (
    <div className="trend-scale-toolbar">
      <div className="trend-scale-control" role="group" aria-label="Skala for trendlinje">
        <button
          type="button"
          aria-pressed={mode === 'absolute'}
          onClick={() => onChange('absolute')}
        >
          Absolutt
        </button>
        <button
          type="button"
          aria-pressed={mode === 'relative'}
          disabled={relativeDisabled}
          title={relativeDisabled ? 'Tokenmengden er ikke klar ennå' : 'Vis treff per million token'}
          onClick={() => onChange('relative')}
        >
          Relativ
        </button>
        <button
          type="button"
          aria-pressed={mode === 'cohort'}
          disabled={!hasComparison}
          title={hasComparison ? 'Vis andelen av de sammenlignede ordene' : 'Kohort krever minst to sammenlignede ord'}
          onClick={() => onChange('cohort')}
        >
          Kohort
        </button>
      </div>
      <div className="trend-scale-control" role="group" aria-label="Glatting av trendlinje">
        <button
          type="button"
          aria-pressed={smoothingMode === 'annual'}
          onClick={() => onSmoothingChange('annual')}
        >
          Årlig
        </button>
        <button
          type="button"
          aria-pressed={smoothingMode === 'five-year'}
          onClick={() => onSmoothingChange('five-year')}
        >
          5-årig
        </button>
      </div>
      <div className="trend-scale-control" role="group" aria-label="Visning av datapunkter">
        <button
          type="button"
          aria-pressed={showPoints}
          onClick={() => onShowPointsChange(!showPoints)}
        >
          Punkter
        </button>
      </div>
      {tokenStatsStatus === 'loading' ? <span>Laster tokenmengde …</span> : null}
      {tokenStatsStatus === 'error' ? <span>Relativ visning er ikke tilgjengelig.</span> : null}
    </div>
  );
}

function App() {
  const [metadataArray, setMetadataArray] = useState<Metadata[]>([]);
  const [uniqueAuthors, setUniqueAuthors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [recentQueries, setRecentQueries] = useState<string[]>(() => loadSearchHistory());
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All Categories']);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [authorSearch, setAuthorSearch] = useState('');
  const [yearRange, setYearRange] = useState<[number, number]>([MIN_YEAR, MAX_YEAR]);
  const [nearWindow, setNearWindow] = useState<number>(5);
  const [beforeWindow, setBeforeWindow] = useState<number>(15);
  const [afterWindow, setAfterWindow] = useState<number>(15);
  const [perBook, setPerBook] = useState<number>(3);
  const [docSamples, setDocSamples] = useState<number>(50);
  const [totalLimit, setTotalLimit] = useState<number>(200);
  const [maxVariants, setMaxVariants] = useState<number>(10);
  const [resultMode, setResultMode] = useState<ResultMode>('render');
  const [selectedComparisonIndex, setSelectedComparisonIndex] = useState(0);
  const [termGroupsInput, setTermGroupsInput] = useState<string>('');
  const [isSymmetric, setIsSymmetric] = useState<boolean>(true);
  const [status, setStatus] = useState('Loading corpus data...');
  const [results, setResults] = useState<React.ReactNode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activePanel, setActivePanel] = useState<WorkspacePanelId | null>(null);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [lastConcordanceRows, setLastConcordanceRows] = useState<ConcordanceRow[]>([]);
  const [lastRenderContext, setLastRenderContext] = useState<RenderResultContext | null>(null);
  const [trendRows, setTrendRows] = useState<YearCountRow[] | null>(null);
  const [trendQuery, setTrendQuery] = useState<string>('');
  const [trendHoverRow, setTrendHoverRow] = useState<YearCountRow | null>(null);
  const [trendComparisonSeries, setTrendComparisonSeries] = useState<TrendComparisonSeries[] | null>(null);
  const [trendComparisonHover, setTrendComparisonHover] = useState<TrendComparisonHover | null>(null);
  const [trendComparisonNotice, setTrendComparisonNotice] = useState('');
  const [hiddenTrendTerms, setHiddenTrendTerms] = useState<string[]>([]);
  const [trendScaleMode, setTrendScaleMode] = useState<TrendScaleMode>('absolute');
  const [trendSmoothingMode, setTrendSmoothingMode] = useState<TrendSmoothingMode>('five-year');
  const [showTrendPoints, setShowTrendPoints] = useState(true);
  const [corpusTokenStats, setCorpusTokenStats] = useState<CorpusTokenStatsResponse | null>(null);
  const [tokenStatsStatus, setTokenStatsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const trendScalePreferenceRef = useRef<TrendScaleMode>('relative');
  const [showTrendConcordanceModal, setShowTrendConcordanceModal] = useState(false);
  const [trendConcordanceYear, setTrendConcordanceYear] = useState<number | null>(null);
  const [trendConcordanceRangeLabel, setTrendConcordanceRangeLabel] = useState<string>('');
  const [trendConcordanceRows, setTrendConcordanceRows] = useState<ConcordanceRow[]>([]);
  const [trendConcordanceContext, setTrendConcordanceContext] = useState<RenderResultContext | null>(null);
  const [trendConcordanceStatus, setTrendConcordanceStatus] = useState<string>('');
  const [trendConcordanceError, setTrendConcordanceError] = useState<string | null>(null);
  const [persistentFilterIds, setPersistentFilterIds] = useState<number[] | null>(null);
  const [debugEnabled, setDebugEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('imagDebugMode') === 'true';
  });
  const [debugRequest, setDebugRequest] = useState<Record<string, unknown> | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const [estimatedExportTotal, setEstimatedExportTotal] = useState<number | null>(null);
  const [exportStatus, setExportStatus] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trendExportRef = useRef<HTMLDivElement>(null);
  const corpusPanelButtonRef = useRef<HTMLButtonElement>(null);
  const parametersPanelButtonRef = useRef<HTMLButtonElement>(null);
  const exportPanelButtonRef = useRef<HTMLButtonElement>(null);
  const helpPanelButtonRef = useRef<HTMLButtonElement>(null);
  const baseMetadataByIdRef = useRef<Map<number, Metadata>>(new Map());
  const baseMetadataArrayRef = useRef<Metadata[]>([]);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const panelButtonRefs = {
    corpus: corpusPanelButtonRef,
    parameters: parametersPanelButtonRef,
    export: exportPanelButtonRef,
    help: helpPanelButtonRef
  };

  const closeActivePanel = () => {
    const panelToFocus = activePanel;
    setActivePanel(null);
    if (panelToFocus) {
      window.requestAnimationFrame(() => panelButtonRefs[panelToFocus].current?.focus());
    }
  };

  const togglePanel = (panel: WorkspacePanelId) => {
    if (activePanel === panel) {
      closeActivePanel();
    } else {
      setActivePanel(panel);
    }
  };

  const buildFilterSelection = (
    activeYearRange: [number, number],
    ignoreYearRange: boolean
  ) => {
    const filteredMetadata = metadataArray.filter((item) => {
      const categoryMatch = selectedCategories.includes('All Categories') ||
        (item.category && selectedCategories.includes(item.category));
      const authorMatch = selectedAuthors.length === 0 ||
        (item.author && selectedAuthors.includes(item.author));
      const year = Number(item.year ?? 0);
      const yearMatch = ignoreYearRange
        ? true
        : year >= activeYearRange[0] && year <= activeYearRange[1];
      return categoryMatch && authorMatch && yearMatch;
    });

    const filterIds = filteredMetadata.map((item) => item.id);
    const constraintYearRange = ignoreYearRange ? [MIN_YEAR, MAX_YEAR] : activeYearRange;
    const hasFilterModalConstraints =
      !selectedCategories.includes('All Categories') ||
      selectedAuthors.length > 0 ||
      constraintYearRange[0] !== MIN_YEAR ||
      constraintYearRange[1] !== MAX_YEAR;
    const baseFilterIds = persistentFilterIds
      ? (hasFilterModalConstraints ? filterIds : persistentFilterIds)
      : filterIds;
    const effectiveFilterIds = baseFilterIds;
    const useFilter = persistentFilterIds
      ? effectiveFilterIds.length > 0
      : (effectiveFilterIds.length > 0 && effectiveFilterIds.length < metadataArray.length);

    return { filteredMetadata, effectiveFilterIds, useFilter };
  };

  const parseResolvableGeoInput = (rawQuery: string): {
    placeText: string;
    remainder: string;
    bracketed: boolean;
  } | null => {
    const trimmed = rawQuery.trim();
    const bracketedMatch = trimmed.match(/^\[#geo:"([^"]+)"\](?:\s+(.*))?$/);
    if (bracketedMatch) {
      return {
        placeText: bracketedMatch[1].trim(),
        remainder: (bracketedMatch[2] || '').trim(),
        bracketed: true
      };
    }

    const rawMatch = trimmed.match(/^#geo:"([^"]+)"(?:\s+(.*))?$/);
    if (rawMatch) {
      return {
        placeText: rawMatch[1].trim(),
        remainder: (rawMatch[2] || '').trim(),
        bracketed: false
      };
    }

    return null;
  };

  const buildResolvedGeoQuery = (resolvedId: string, remainder: string, bracketed: boolean): string => {
    const safeId = resolvedId.replace(/"/g, '').trim();
    const tokenValue = /^\d+$/.test(safeId) ? `#geo:${safeId}` : `#geo:"${safeId}"`;
    const token = `${bracketed ? '[' : ''}${tokenValue}${bracketed ? ']' : ''}`;
    return remainder ? `${token} ${remainder}` : token;
  };

  const resolvePlaceCandidates = async (placeText: string, limit = 5): Promise<PlaceResolverMatch[]> => {
    const response = await fetch(PLACE_RESOLVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: placeText, limit })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resolver error ${response.status}: ${errorText}`);
    }

    const payload: PlaceResolverResponse = await response.json();
    return Array.isArray(payload.matches) ? payload.matches : [];
  };

  const parseGeoQuery = (rawQuery: string): {
    terms: string[] | null;
    termGroups: string[][] | null;
    extraTermsText: string | null;
    invalid: boolean;
  } => {
    const trimmed = rawQuery.trim();
    if (!/#geo/.test(trimmed)) return { terms: null, termGroups: null, extraTermsText: null, invalid: false };

    // If #geo appears, it must be the first expression.
    if (!trimmed.startsWith('#geo') && !trimmed.startsWith('[#geo')) {
      return { terms: null, termGroups: null, extraTermsText: null, invalid: true };
    }

    let geoToken: string | null = null;
    let remainder = '';
    const geoTokenPattern = '#geo(?::(?:nb:)?\\d+|:(?:geonames|internal):\\S+|:"[^"]+")?';

    const bracketedMatch = trimmed.match(new RegExp(`^\\[(${geoTokenPattern})\\](?:\\s+(.*))?$`));
    if (bracketedMatch) {
      geoToken = bracketedMatch[1];
      remainder = (bracketedMatch[2] || '').trim();
    } else {
      const rawMatch = trimmed.match(new RegExp(`^(${geoTokenPattern})(?:\\s+(.*))?$`));
      if (rawMatch) {
        geoToken = rawMatch[1];
        remainder = (rawMatch[2] || '').trim();
      }
    }

    if (!geoToken) {
      return { terms: null, termGroups: null, extraTermsText: null, invalid: true };
    }

    if (!remainder) {
      return { terms: [geoToken], termGroups: null, extraTermsText: null, invalid: false };
    }

    try {
      const parsedGroups = parseTermGroups(remainder);
      if (!parsedGroups || parsedGroups.length === 0) {
        return { terms: null, termGroups: null, extraTermsText: null, invalid: true };
      }

      const extraTermsText = parsedGroups.flat().join(' ');
      return {
        terms: null,
        termGroups: [[geoToken], ...parsedGroups],
        extraTermsText,
        invalid: false
      };
    } catch {
      return { terms: null, termGroups: null, extraTermsText: null, invalid: true };
    }
  };

  const getNbGeoFallbackToken = (token: string): string | null => {
    const primaryMatch = token.match(/^#geo:(\d+)$/);
    if (primaryMatch) {
      return `#geo:nb:${primaryMatch[1]}`;
    }

    const prefixedMatch = token.match(/^#geo:nb:(\d+)$/);
    if (prefixedMatch) {
      return `#geo:${prefixedMatch[1]}`;
    }

    return null;
  };

  const withGeoAnnotationTitles = (html: string): string => {
    if (!html || typeof window === 'undefined') return html;
    const sanitizedHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['annotation', 'mark', 'span', 'em', 'strong', 'b', 'i', 'br'],
      ALLOWED_ATTR: ['data-layer', 'data-geo-id', 'data-id', 'data-label', 'title', 'class']
    });
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="geo-wrap">${sanitizedHtml}</div>`, 'text/html');
    const wrapper = doc.getElementById('geo-wrap');
    if (!wrapper) return html;

    wrapper.querySelectorAll('annotation[data-layer="geo"]').forEach((node) => {
      const canonicalName = node.getAttribute('data-geo-canonical-name') || node.getAttribute('data-geo-canonical');
      const country = node.getAttribute('data-geo-country');
      const lat = node.getAttribute('data-geo-lat');
      const lon = node.getAttribute('data-geo-lon');
      const geonamesId = node.getAttribute('data-geo-geonames-id');
      const placeId = node.getAttribute('data-geo-place-id');
      const tooltipParts = [
        canonicalName && `Sted: ${canonicalName}`,
        country && `Land: ${country}`,
        geonamesId && `Geonames: ${geonamesId}`,
        placeId && `Place ID: ${placeId}`,
        lat && lon && `Koordinater: ${lat}, ${lon}`
      ].filter(Boolean);

      if (tooltipParts.length > 0) {
        node.setAttribute('data-geo-tooltip', tooltipParts.join(' | '));
        node.removeAttribute('title');
      }
    });

    return wrapper.innerHTML;
  };

  const mergeGeoRenderedFragment = (row: ConcordanceRow, renderedFrag: string | undefined): string | null => {
    if (!renderedFrag) return null;

    const annotationHtml = row.fragHtml ? withGeoAnnotationTitles(row.fragHtml) : null;
    if (!annotationHtml) return renderedFrag;

    const candidates = [row.surfaceText, row.fragRaw, row.frag]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());

    for (const candidate of candidates) {
      const bracketedCandidate = `[${candidate}]`;
      if (renderedFrag.includes(bracketedCandidate)) {
        return renderedFrag.replace(bracketedCandidate, `[${annotationHtml}]`);
      }
    }

    return renderedFrag;
  };

  const buildNationalLibraryLink = (urn: string | undefined, searchText: string): string => {
    if (urn && urn.trim().length > 0) {
      return `https://www.nb.no/items/${urn}?searchText=${encodeURIComponent(searchText)}`;
    }
    return `https://www.nb.no/search?q=${encodeURIComponent(searchText)}`;
  };

  useEffect(() => {
    const timestamp = new Date().getTime();
    const jsonUrl = `corpus.json?v=${timestamp}`;

    fetch(jsonUrl)
      .then(res => res.json())
      .then(data => {
        const sanitizedData = JSON.parse(
          JSON.stringify(data, (_, value) => 
            typeof value === "number" && isNaN(value) ? null : value
          )
        );

        if (sanitizedData && Array.isArray(sanitizedData.dhlabids)) {
          const baseMetadata = sanitizedData.dhlabids.filter(
            (item: Metadata) => Number.isFinite(Number(item.id))
          ) as Metadata[];
          baseMetadataByIdRef.current = new Map(
            baseMetadata.map((item) => [Number(item.id), item])
          );
          baseMetadataArrayRef.current = sanitizedData.dhlabids;
          setMetadataArray(sanitizedData.dhlabids);
          setPersistentFilterIds(null);
          setSelectedAuthors([]);
          setAuthorSearch('');
          setSelectedCategories(['All Categories']);
          setYearRange([MIN_YEAR, MAX_YEAR]);
          setResults(null);
          setLastConcordanceRows([]);
          setTrendRows(null);
          setTrendQuery('');
          setTrendHoverRow(null);
          setDebugRequest(null);
          setDebugInfo(null);
          // Extract unique authors
          const authors = Array.from(new Set(
            sanitizedData.dhlabids
              .map((item: Metadata) => item.author)
              .filter((author: string | undefined): author is string => !!author)
          )).sort() as string[];
          setUniqueAuthors(authors);
          setStatus(`Loaded metadata for ${sanitizedData.dhlabids.length} documents.`);
        } else {
          setStatus("Error: No valid metadata array found in JSON.");
          console.error("No valid metadata array in data:", sanitizedData);
        }
      })
      .catch(err => {
        setStatus(`Error loading metadata: ${err.message}`);
        console.error("Failed to load metadata:", err);
      });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('imagDebugMode', String(debugEnabled));
    }
  }, [debugEnabled]);

  useEffect(() => {
    if (!activePanel) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActivePanel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activePanel]);

  useEffect(() => {
    setEstimatedExportTotal(null);
    setExportStatus('');
  }, [
    query,
    selectedAuthors,
    selectedCategories,
    yearRange,
    persistentFilterIds,
    nearWindow,
    beforeWindow,
    afterWindow,
    maxVariants,
    termGroupsInput,
    isSymmetric
  ]);

  useEffect(() => {
    if (metadataArray.length === 0) return;

    const controller = new AbortController();
    const { effectiveFilterIds, useFilter } = buildFilterSelection([MIN_YEAR, MAX_YEAR], true);
    const request = buildCorpusTokenStatsRequest({ useFilter, filterIds: effectiveFilterIds });
    setTokenStatsStatus('loading');
    setCorpusTokenStats(null);
    setTrendScaleMode((current) => current === 'relative' ? 'absolute' : current);

    fetch(`https://api.nb.no/dhlab/imag/${request.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        return response.json() as Promise<CorpusTokenStatsResponse>;
      })
      .then((payload) => {
        setCorpusTokenStats(payload);
        setTokenStatsStatus('ready');
        if (trendScalePreferenceRef.current === 'relative') {
          setTrendScaleMode('relative');
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('Token statistics unavailable:', error);
        setCorpusTokenStats(null);
        setTokenStatsStatus('error');
      });

    return () => controller.abort();
  }, [metadataArray, selectedAuthors, selectedCategories, persistentFilterIds]);

  const performSearch = async (overrideQueryOrOptions?: string | SearchOverrides) => {
    const overrides: SearchOverrides = typeof overrideQueryOrOptions === 'string'
      ? { query: overrideQueryOrOptions }
      : (overrideQueryOrOptions ?? {});
    let trimmedQuery = (overrides.query ?? query).trim();
    const activeResultMode = overrides.resultMode ?? resultMode;
    const activeYearRange = overrides.yearRange ?? yearRange;
    const requestedComparisonIndex = overrides.comparisonIndex ?? selectedComparisonIndex;

    if (/^:debug\s+on$/i.test(trimmedQuery)) {
      setDebugEnabled(true);
      setStatus("Debug mode enabled.");
      return;
    }

    if (/^:debug\s+off$/i.test(trimmedQuery)) {
      setDebugEnabled(false);
      setStatus("Debug mode disabled.");
      return;
    }

    if (!trimmedQuery) {
      alert("Please enter a search term");
      return;
    }

    setRecentQueries((current) => rememberSearchQuery(trimmedQuery, current));

    if (!metadataArray || metadataArray.length === 0) {
      alert("Metadata not loaded yet. Please try again.");
      return;
    }

    setIsLoading(true);
    setStatus("Searching...");
    setResults(null);
    setLastConcordanceRows([]);
    setLastRenderContext(null);
    setTrendRows(null);
    setTrendQuery('');
    setTrendHoverRow(null);
    setTrendComparisonSeries(null);
    setTrendComparisonHover(null);
    setTrendComparisonNotice('');
    setHiddenTrendTerms([]);

    try {
      const geoResolverInput = parseResolvableGeoInput(trimmedQuery);
      if (geoResolverInput) {
        setStatus(`Resolving place: ${geoResolverInput.placeText}...`);
        const resolverMatches = await resolvePlaceCandidates(geoResolverInput.placeText);
        const normalizedPlaceText = geoResolverInput.placeText.toLowerCase();
        const exactMatches = resolverMatches.filter((match) =>
          match.matchType === 'exact' ||
          [match.id, match.canonicalName, match.matchedForm]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .some((value) => value.toLowerCase() === normalizedPlaceText)
        );
        const selectedMatch = exactMatches.length === 1
          ? exactMatches[0]
          : resolverMatches.length === 1
            ? resolverMatches[0]
            : exactMatches.length > 0
              ? exactMatches[0]
              : null;

        if (!selectedMatch) {
          setStatus(`Fant ${resolverMatches.length} stedskandidater for "${geoResolverInput.placeText}". Velg en kandidat for å fortsette.`);
          setLastConcordanceRows([]);
          setDebugInfo({
            resolverQuery: geoResolverInput.placeText,
            resolverMatches: resolverMatches.map((match) => ({
              id: match.id,
              canonicalName: match.canonicalName,
              country: match.country,
              matchType: match.matchType
            }))
          });
          setResults(
            <div className="place-choices">
              <p><strong>Mulige steder for "{geoResolverInput.placeText}"</strong></p>
              <div className="choice-list">
                {resolverMatches.map((match) => {
                  const nextQuery = buildResolvedGeoQuery(match.id, geoResolverInput.remainder, geoResolverInput.bracketed);
                  const alternateForms = (match.alternateForms || []).filter(Boolean).slice(0, 5);
                  return (
                    <button
                      key={`${match.id}-${match.country ?? 'unknown'}`}
                      type="button"
                      className="choice-button"
                      title={`Bruk ${match.canonicalName || match.id}`}
                      onClick={() => {
                        setQuery(nextQuery);
                        void performSearch(nextQuery);
                      }}
                    >
                      <div className="choice-button__header">
                        <div>
                          <strong>{match.canonicalName || match.id}</strong>
                          <div className="secondary-text">
                            id: {match.id}
                            {match.country ? ` | ${match.country}` : ''}
                          </div>
                        </div>
                        {match.matchType && (
                          <span className="choice-badge">{match.matchType}</span>
                        )}
                      </div>
                      {match.matchedForm && (
                        <div className="secondary-text">
                          <strong>Treffform:</strong> {match.matchedForm}
                        </div>
                      )}
                      {(match.lat !== undefined || match.lon !== undefined) && (
                        <div className="secondary-text">
                          koordinater: {match.lat ?? '?'}{match.lon !== undefined ? `, ${match.lon}` : ''}
                        </div>
                      )}
                      {alternateForms.length > 0 && (
                        <div className="secondary-text">
                          alternativer: {alternateForms.join(', ')}
                        </div>
                      )}
                      <div className="choice-button__action">Klikk for å bruke dette stedet</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
          return;
        }

        trimmedQuery = buildResolvedGeoQuery(selectedMatch.id, geoResolverInput.remainder, geoResolverInput.bracketed);
        setQuery(trimmedQuery);
      }

      const geoQuery = parseGeoQuery(trimmedQuery);
      if (geoQuery.invalid) {
        setStatus('Ugyldig geo-søk. Bruk #geo med valgfrie ordgrupper, #geo:"stednavn", eller #geo:<nb_id> / #geo:nb:<nb_id>.');
        setResults(<p key="geo-format-error" className="error">Ugyldig geo-format.</p>);
        return;
      }

      let comparisonExpressions: ReturnType<typeof parseComparisonExpressions> = null;
      try {
        comparisonExpressions = parseComparisonExpressions(trimmedQuery);
      } catch (error) {
        setStatus(`Ugyldig sammenligning: ${error instanceof Error ? error.message : 'Ukjent syntaksfeil'}`);
        setResults(<p key="comparison-format-error" className="error">Kontroller krøllparenteser og semikolon.</p>);
        return;
      }
      const primaryComparison = comparisonExpressions?.[
        activeResultMode === 'render'
          ? Math.min(Math.max(requestedComparisonIndex, 0), comparisonExpressions.length - 1)
          : 0
      ];
      const queryForParsing = primaryComparison?.label ?? trimmedQuery;
      const hasQuotedPhrase = primaryComparison?.matchMode === 'sequence' || /^"[^"]+"$/.test(queryForParsing);
      const normalizedQuery = hasQuotedPhrase ? queryForParsing.slice(1, -1).trim() : queryForParsing;
      const words = normalizedQuery.split(/\s+/).filter(Boolean);
      let parsedTermGroups: string[][] | null = primaryComparison?.termGroups ?? null;
      const termGroupsSource = primaryComparison
        ? ''
        : termGroupsInput.trim() || (trimmedQuery.includes('[') ? trimmedQuery : '');
      const autoTermGroups =
        !primaryComparison && !termGroupsInput.trim() && !trimmedQuery.includes('[') && words.length >= 1
          ? toSingleTermGroups(normalizedQuery)
          : null;

      if (termGroupsSource) {
        try {
          parsedTermGroups = parseTermGroups(termGroupsSource);
        } catch (error) {
          setStatus(`Invalid termGroups format: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setResults(<p key="term-groups-error" className="error">Invalid termGroups format.</p>);
          return;
        }
      }

      const effectiveTermGroups = (geoQuery.terms || geoQuery.termGroups) ? null : (parsedTermGroups ?? autoTermGroups);

      if (!effectiveTermGroups && !geoQuery.terms && !geoQuery.termGroups) {
        alert("Please enter a search term");
        return;
      }

      if (
        comparisonExpressions
        && activeResultMode !== 'render'
        && comparisonExpressions.length > MAX_COMPARISON_TERMS
      ) {
        setStatus(`Du kan sammenligne opptil ${MAX_COMPARISON_TERMS} søk om gangen.`);
        setResults(<p key="too-many-comparison-terms">Reduser antall uttrykk mellom krøllparentesene.</p>);
        return;
      }

      // For trend mode, use the year range as the plotted viewport.
      // Keep the corpus filter stable so zooming does not change the underlying slice.
      const { filteredMetadata, effectiveFilterIds, useFilter } = buildFilterSelection(
        activeYearRange,
        activeResultMode === 'year-count'
      );

      if (filteredMetadata.length === 0) {
        setStatus("No documents match the selected filters.");
        setResults(<p key="no-filter-results">No documents match the selected filters.</p>);
        return;
      }
      const normalizedParameters = normalizeSearchParameters({
        resultMode: activeResultMode,
        perBook,
        docSamples,
        totalLimit,
        nearWindow,
        beforeWindow,
        afterWindow,
        maxVariants
      });
      const normalizedNearWindow = normalizedParameters.nearWindow;
      const normalizedBefore = normalizedParameters.beforeWindow;
      const normalizedAfter = normalizedParameters.afterWindow;
      const normalizedOrQueryBefore = Math.max(1, normalizedBefore);
      const normalizedOrQueryAfter = Math.max(1, normalizedAfter);
      const normalizedPerBook = normalizedParameters.perBook;
      const normalizedDocSamples = normalizedParameters.docSamples;
      const normalizedTotalLimit = normalizedParameters.totalLimit;
      const normalizedOrQueryTotalLimit = Math.min(normalizedTotalLimit, 5000);
      const normalizedMaxVariants = normalizedParameters.maxVariants;
      const effectiveMatchMode: 'sequence' | 'near' = hasQuotedPhrase ? 'sequence' : 'near';
      const usesOrQuery = !!effectiveTermGroups && effectiveTermGroups.length === 1;
      const usesInlineTermGroups = !!parsedTermGroups && !termGroupsInput.trim() && trimmedQuery.includes('[');
      const usesAutoPhraseTermGroups = !!autoTermGroups && words.length >= 2;
      const usesFastNearProfile = usesInlineTermGroups || usesAutoPhraseTermGroups;
      const usesNearQueryAggregate = activeResultMode === 'count' || activeResultMode === 'year-count';
      const nearQueryMode = activeResultMode === 'year-count' ? 'year-count' : 'count';
      const yearCountRange = activeResultMode === 'year-count'
        ? {
            startYear: activeYearRange[0],
            endYear: activeYearRange[1],
            countMode: 'anchor' as const
          }
        : {};

      // Keep the user-selected per-book sample count; only trim broader cost drivers below.
      const effectivePerBook = normalizedPerBook;
      const effectiveDocSamples = normalizedDocSamples;
      const effectiveTotalLimit = usesFastNearProfile ? Math.min(normalizedTotalLimit, 100) : normalizedTotalLimit;
      const effectiveMaxVariants = usesFastNearProfile ? Math.min(normalizedMaxVariants, 6) : normalizedMaxVariants;

      const endpointPath = geoQuery.termGroups
        ? "near_query"
        : geoQuery.terms
        ? "or_query"
        : usesNearQueryAggregate
        ? "near_query"
        : usesOrQuery
        ? "or_query"
        : "near_fragments";

      const requestBody = geoQuery.termGroups
        ? {
            termGroups: geoQuery.termGroups,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            mode: activeResultMode === 'year-count' ? 'year-count' : activeResultMode,
            perBook: effectivePerBook,
            totalLimit: effectiveTotalLimit,
            docSamples: effectiveDocSamples,
            schema: "unigrams",
            symmetric: isSymmetric,
            excludeSelf: false,
            window: normalizedNearWindow,
            before: normalizedBefore,
            after: normalizedAfter,
            ...yearCountRange
          }
        : geoQuery.terms
        ? {
            terms: geoQuery.terms,
            before: normalizedOrQueryBefore,
            after: normalizedOrQueryAfter,
            docSamples: effectiveDocSamples,
            totalLimit: normalizedOrQueryTotalLimit,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            renderHits: true
          }
        : endpointPath === "near_query"
        ? {
            termGroups: effectiveTermGroups,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            mode: nearQueryMode,
            perBook: effectivePerBook,
            totalLimit: effectiveTotalLimit,
            docSamples: effectiveDocSamples,
            schema: "unigrams",
            symmetric: isSymmetric,
            excludeSelf: false,
            window: normalizedNearWindow,
            before: normalizedBefore,
            after: normalizedAfter,
            ...yearCountRange
          }
        : endpointPath === "near_fragments"
        ? {
            termGroups: effectiveTermGroups,
            matchMode: effectiveMatchMode,
            window: normalizedNearWindow,
            before: normalizedBefore,
            after: normalizedAfter,
            perBook: effectivePerBook,
            docSamples: effectiveDocSamples,
            totalLimit: effectiveTotalLimit,
            schema: "unigrams",
            symmetric: isSymmetric,
            excludeSelf: false,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            maxVariants: effectiveMaxVariants,
            engine: "python"
          }
        : endpointPath === "or_query"
          ? {
              termGroups: effectiveTermGroups,
              before: normalizedOrQueryBefore,
              after: normalizedOrQueryAfter,
              perBook: effectivePerBook,
              docSamples: effectiveDocSamples,
              totalLimit: normalizedOrQueryTotalLimit,
              schema: "unigrams",
              useFilter,
              filterIds: useFilter ? effectiveFilterIds : [],
              maxVariants: effectiveMaxVariants
            }
        : null;

      if (!requestBody) {
        throw new Error(`Unsupported endpoint configuration: ${endpointPath}`);
      }

      setDebugRequest({
        endpoint: endpointPath,
        ...requestBody,
        geoFallbackCandidate: geoQuery.terms && geoQuery.terms.length === 1 ? getNbGeoFallbackToken(geoQuery.terms[0]) : null,
        filterIds: `[${useFilter ? effectiveFilterIds.length : 0} ids]`
      });

      const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const usedEngine = endpointPath === "near_fragments" ? "python" : null;
      const runSearchRequest = (body: Record<string, unknown>) => fetch(`https://api.nb.no/dhlab/imag/${endpointPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const buildFallbackRequestBody = (token: string): typeof requestBody => ({
        ...requestBody,
        terms: [token]
      } as typeof requestBody);
      const fallbackGeoToken = geoQuery.terms && geoQuery.terms.length === 1
        ? getNbGeoFallbackToken(geoQuery.terms[0])
        : null;
      let activeRequestBody: typeof requestBody = requestBody;
      let activeGeoToken = geoQuery.terms?.[0] ?? null;
      let geoFallbackApplied = false;

      if (comparisonExpressions && activeResultMode !== 'render' && endpointPath === 'near_query') {
        const comparisonResponses: Array<{
          term: string;
          response: Response;
        }> = [];
        for (const [index, expression] of comparisonExpressions.entries()) {
          setStatus(`Kjører sammenligning ${index + 1} av ${comparisonExpressions.length}: ${expression.label} …`);
          const response = await runSearchRequest({
            ...requestBody,
            termGroups: expression.termGroups,
            matchMode: expression.matchMode
          });
          if (!response.ok && response.status !== 404) {
            throw new Error(`HTTP error ${response.status} for "${expression.label}": ${await response.text()}`);
          }
          comparisonResponses.push({ term: expression.label, response });
        }
        const comparisonElapsedMs = Math.round(
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - requestStartedAt
        );

        if (activeResultMode === 'year-count') {
          const series = await Promise.all(comparisonResponses.map(async ({ term, response }) => {
            const payload: YearCountResponse = response.status === 404 ? {} : await response.json();
            return {
              term,
              rows: Array.isArray(payload.rows) ? [...payload.rows].sort((a, b) => a.year - b.year) : []
            };
          }));
          const total = series.reduce(
            (seriesSum, item) => seriesSum + item.rows.reduce(
              (rowSum, row) => rowSum + (typeof row.total === 'number' ? row.total : 0),
              0
            ),
            0
          );
          setEstimatedExportTotal(total);
          setStatus(
            `Sammenligner ${comparisonExpressions.length} søk over tid: ` +
            `${numberFormatter.format(total)} treff over seriene (${comparisonElapsedMs} ms)`
          );
          setLastConcordanceRows([]);
          setLastRenderContext(null);
          setTrendRows(null);
          setTrendQuery(trimmedQuery);
          setTrendComparisonSeries(series);
          setTrendComparisonHover(null);
          setTrendComparisonNotice('');
          setHiddenTrendTerms([]);
          setResults(null);
          setDebugInfo({
            endpoint: endpointPath,
            queryMode: 'comparison-year-count',
            resultMode: activeResultMode,
            comparisonExpressions: comparisonExpressions.map((expression) => ({
              label: expression.label,
              termGroups: expression.termGroups
            })),
            series: series.map((item) => ({ term: item.term, years: item.rows.length })),
            total,
            responseMs: comparisonElapsedMs,
            filteredDocs: filteredMetadata.length,
            useFilter,
            filterIdsCount: useFilter ? effectiveFilterIds.length : 0
          });
          return;
        }

        const counts = await Promise.all(comparisonResponses.map(async ({ term, response }) => {
          const payload: CountResponse = response.status === 404 ? {} : await response.json();
          return {
            term,
            total: typeof payload.total === 'number' ? payload.total : 0,
            docs: typeof payload.docs === 'number' ? payload.docs : 0
          };
        }));
        const total = counts.reduce((sum, item) => sum + item.total, 0);
        setEstimatedExportTotal(total);
        setStatus(
          `Telte ${comparisonExpressions.length} søk separat: ` +
          `${numberFormatter.format(total)} treff over søkene (${comparisonElapsedMs} ms)`
        );
        setLastConcordanceRows([]);
        setLastRenderContext(null);
        setResults(
          <div className="comparison-count-grid">
            {counts.map((item) => (
              <div className="year-count-card" key={`count-${item.term}`}>
                <strong>{item.term}</strong>
                <span>{numberFormatter.format(item.total)} treff</span>
                <small>{numberFormatter.format(item.docs)} dokumenter</small>
              </div>
            ))}
          </div>
        );
        setDebugInfo({
          endpoint: endpointPath,
          queryMode: 'comparison-count',
          resultMode: activeResultMode,
          comparisonExpressions: comparisonExpressions.map((expression) => ({
            label: expression.label,
            termGroups: expression.termGroups
          })),
          counts,
          total,
          responseMs: comparisonElapsedMs,
          filteredDocs: filteredMetadata.length,
          useFilter,
          filterIdsCount: useFilter ? effectiveFilterIds.length : 0
        });
        return;
      }

      let concResp = await runSearchRequest(activeRequestBody);
      if (!concResp.ok && concResp.status === 404 && fallbackGeoToken && activeGeoToken !== fallbackGeoToken) {
        activeRequestBody = buildFallbackRequestBody(fallbackGeoToken);
        activeGeoToken = fallbackGeoToken;
        geoFallbackApplied = true;
        concResp = await runSearchRequest(activeRequestBody);
      }

      if (!concResp.ok) {
        const errorText = await concResp.text();
        if (concResp.status === 404) {
          const categoryText = selectedCategories.includes('All Categories')
            ? ''
            : ` in categories: ${selectedCategories.join(', ')}`;
          const authorText = selectedAuthors.length > 0
            ? ` by authors: ${selectedAuthors.join(', ')}`
            : '';
          const yearText = activeYearRange[0] === MIN_YEAR && activeYearRange[1] === MAX_YEAR
            ? ''
            : ` from ${activeYearRange[0]} to ${activeYearRange[1]}`;
          setStatus(`No results for "${trimmedQuery}"${categoryText}${authorText}${yearText}`);
          setResults(<p key="no-results">No results found for this query.</p>);
          setLastConcordanceRows([]);
          setDebugInfo({
            endpoint: endpointPath,
            queryMode: endpointPath,
            httpStatus: 404,
            backendMessage: errorText
          });
          return;
        }
        throw new Error(`HTTP error ${concResp.status}: ${errorText}`);
      }

      const responseElapsedMs = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - requestStartedAt
      );

      if (endpointPath === "near_query" && activeResultMode === 'year-count') {
        const yearCountResp: YearCountResponse = await concResp.json();
        if (trendScaleMode === 'cohort') {
          setTrendScaleMode('absolute');
        }
        const categoryText = selectedCategories.includes('All Categories')
          ? ''
          : ` in categories: ${selectedCategories.join(', ')}`;
        const authorText = selectedAuthors.length > 0
          ? ` by authors: ${selectedAuthors.join(', ')}`
          : '';
        const yearText = activeYearRange[0] === MIN_YEAR && activeYearRange[1] === MAX_YEAR
          ? ''
          : ` from ${activeYearRange[0]} to ${activeYearRange[1]}`;
        const rows = Array.isArray(yearCountResp.rows)
          ? [...yearCountResp.rows].sort((a, b) => a.year - b.year)
          : [];
        const total = rows.reduce((sum, row) => sum + (typeof row.total === 'number' ? row.total : 0), 0);
        setEstimatedExportTotal(total);
        const peakRow = rows.reduce<YearCountRow | null>((peak, row) => {
          const currentTotal = typeof row.total === 'number' ? row.total : 0;
          const peakTotal = peak && typeof peak.total === 'number' ? peak.total : -1;
          return currentTotal > peakTotal ? row : peak;
        }, null);

        setStatus(
          `Found ${numberFormatter.format(total)} matches for "${trimmedQuery}"${categoryText}${authorText}${yearText} ` +
          `across ${rows.length} years${peakRow ? ` (peak: ${peakRow.year} = ${numberFormatter.format(peakRow.total ?? 0)})` : ''} ` +
          `(${responseElapsedMs} ms)`
        );
        setLastConcordanceRows([]);
        setLastRenderContext(null);
        setTrendRows(rows);
        setTrendQuery(trimmedQuery);
        setTrendHoverRow(null);
        setResults(null);
        setDebugInfo({
          endpoint: endpointPath,
          queryMode: endpointPath,
          usedEngine: null,
          isGeoQuery: !!geoQuery.termGroups,
          resultMode: activeResultMode,
          years: rows.length,
          total,
          peakYear: peakRow?.year ?? null,
          peakTotal: peakRow?.total ?? 0,
          responseMs: responseElapsedMs,
          filteredDocs: filteredMetadata.length,
          useFilter,
          filterIdsCount: useFilter ? effectiveFilterIds.length : 0
        });
        return;
      }

      if (endpointPath === "near_query" && activeResultMode === 'count') {
        const countResp: CountResponse = await concResp.json();
        const categoryText = selectedCategories.includes('All Categories')
          ? ''
          : ` in categories: ${selectedCategories.join(', ')}`;
        const authorText = selectedAuthors.length > 0
          ? ` by authors: ${selectedAuthors.join(', ')}`
          : '';
        const yearText = activeYearRange[0] === MIN_YEAR && activeYearRange[1] === MAX_YEAR
          ? ''
          : ` from ${activeYearRange[0]} to ${activeYearRange[1]}`;
        const total = typeof countResp.total === 'number' ? countResp.total : 0;
        const docs = typeof countResp.docs === 'number' ? countResp.docs : 0;
        setEstimatedExportTotal(total);

        setStatus(`Found ${total} matches for "${trimmedQuery}"${categoryText}${authorText}${yearText} (docs: ${docs}, ${responseElapsedMs} ms)`);
        setLastConcordanceRows([]);
        setLastRenderContext(null);
        setResults(
          <div className="concordance">
            <p><strong>Treff:</strong> {total}</p>
            <p><strong>Dokumenter:</strong> {docs}</p>
            <p><strong>Tid:</strong> {responseElapsedMs} ms</p>
          </div>
        );
        setDebugInfo({
          endpoint: endpointPath,
          queryMode: endpointPath,
          usedEngine: null,
          isGeoQuery: !!geoQuery.termGroups,
          resultMode: activeResultMode,
          total,
          docs,
          responseMs: responseElapsedMs,
          filteredDocs: filteredMetadata.length,
          useFilter,
          filterIdsCount: useFilter ? effectiveFilterIds.length : 0
        });
        return;
      }

      let conc: ConcordanceResponse = await concResp.json();
      if (geoQuery.terms && !geoFallbackApplied && fallbackGeoToken && activeGeoToken !== fallbackGeoToken) {
        const currentRows = Array.isArray(conc.rows) ? conc.rows : [];
        const currentRenderedRows = Array.isArray(conc.rendered) ? conc.rendered : [];
        if (currentRows.length === 0 && currentRenderedRows.length === 0) {
          activeRequestBody = buildFallbackRequestBody(fallbackGeoToken);
          activeGeoToken = fallbackGeoToken;
          geoFallbackApplied = true;
          const fallbackResp = await runSearchRequest(activeRequestBody);
          if (fallbackResp.ok) {
            conc = await fallbackResp.json();
          }
        }
      }
      const categoryText = selectedCategories.includes('All Categories') 
        ? '' 
        : ` in categories: ${selectedCategories.join(', ')}`;
      const authorText = selectedAuthors.length > 0
        ? ` by authors: ${selectedAuthors.join(', ')}`
        : '';
      const yearText = activeYearRange[0] === MIN_YEAR && activeYearRange[1] === MAX_YEAR
        ? ''
        : ` from ${activeYearRange[0]} to ${activeYearRange[1]}`;
      const rows = Array.isArray(conc.rows) ? conc.rows : [];
      const renderedRows = Array.isArray(conc.rendered) ? conc.rendered : [];
      const mergedRows = geoQuery.terms && renderedRows.length > 0
        ? rows.map((row, index) => {
            const renderedMatch = renderedRows.find((renderedRow) =>
              renderedRow.bookId === row.bookId &&
              renderedRow.pos === row.pos
            ) || renderedRows[index];
            const mergedFrag = renderedMatch?.frag;
            const mergedFragHtml = mergeGeoRenderedFragment(row, mergedFrag);

            return {
              ...row,
              frag: mergedFrag ?? row.frag,
              fragRaw: mergedFrag ?? row.fragRaw,
              fragHtml: mergedFragHtml ?? row.fragHtml
            };
          })
        : rows;
      const sampledDocs = new Set(mergedRows.map((row) => row.bookId)).size;
      const expectedSampleCap = effectiveDocSamples * effectivePerBook;
      setStatus(
        `Found ${mergedRows.length} results for "${trimmedQuery}"${categoryText}${authorText}${yearText} ` +
        `(sampled docs: ${sampledDocs}, cap: ${expectedSampleCap}, ${responseElapsedMs} ms)`
      );
      setLastConcordanceRows(mergedRows);
      setLastRenderContext({
        trimmedQuery,
        normalizedBefore,
        normalizedAfter,
        normalizedNearWindow,
        extraGeoTermsText: geoQuery.extraTermsText
      });
      const debugPreviewMeta = mergedRows.length > 0
        ? metadataArray.find(item => item.id === mergedRows[0].bookId)
        : undefined;
      const debugPreviewQuery = `"${trimmedQuery}"~${normalizedNearWindow}`;
      const debugPreviewLink = debugPreviewMeta
        ? buildNationalLibraryLink(debugPreviewMeta.urn, debugPreviewQuery)
        : null;
      setDebugInfo({
        endpoint: endpointPath,
        queryMode: endpointPath,
        usedEngine,
        isGeoQuery: !!geoQuery.terms,
        resultMode: (geoQuery.termGroups || (!!effectiveTermGroups && effectiveTermGroups.length > 1)) ? activeResultMode : null,
        rows: mergedRows.length,
        renderedRows: renderedRows.length,
        geoRenderedMergeApplied: !!geoQuery.terms && renderedRows.length > 0,
        geoFallbackApplied,
        geoTokenUsed: activeGeoToken,
        sampledDocs,
        expectedSampleCap,
        perBook: effectivePerBook,
        docSamples: effectiveDocSamples,
        responseMs: responseElapsedMs,
        fastProfileApplied: usesFastNearProfile,
        matchMode: endpointPath === "near_fragments" ? effectiveMatchMode : null,
        phraseQuoted: hasQuotedPhrase,
        hasPersistentFilterIds: !!persistentFilterIds,
        filteredDocs: filteredMetadata.length,
        useFilter,
        filterIdsCount: useFilter ? effectiveFilterIds.length : 0,
        nbPreviewLink: debugPreviewLink
      });

      if (mergedRows.length === 0) {
        setResults(<p key="no-results">No results found for this query.</p>);
        return;
      }
      setResults(null);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setResults(<p key="error" className="error">Search failed: {error instanceof Error ? error.message : 'Unknown error'}</p>);
      setLastConcordanceRows([]);
      setDebugInfo({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  let comparisonOptions: string[] = [];
  try {
    comparisonOptions = parseComparisonExpressions(query)?.map((expression) => expression.label) ?? [];
  } catch {
    comparisonOptions = [];
  }
  const activeComparisonIndex = comparisonOptions.length === 0
    ? 0
    : Math.min(selectedComparisonIndex, comparisonOptions.length - 1);

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setSelectedComparisonIndex(0);
  };

  const handleResultModeChange = (nextMode: ResultMode) => {
    setResultMode(nextMode);
    const nextComparisonIndex = nextMode === 'render' ? 0 : selectedComparisonIndex;
    if (nextMode === 'render') {
      setSelectedComparisonIndex(0);
    }
    if (query.trim()) {
      void performSearch({
        resultMode: nextMode,
        comparisonIndex: nextComparisonIndex
      });
    }
  };

  const handleComparisonChange = (nextIndex: number) => {
    setSelectedComparisonIndex(nextIndex);
    if (query.trim()) {
      void performSearch({ comparisonIndex: nextIndex });
    }
  };

  const openTrendConcordancesForYear = async (
    year: number,
    queryText: string,
    span: 'exact' | 'window5' = 'exact'
  ) => {
    const activeYearRange: [number, number] = span === 'window5'
      ? [Math.max(MIN_YEAR, year - 5), Math.min(MAX_YEAR, year + 5)]
      : [year, year];
    const rangeLabel = activeYearRange[0] === activeYearRange[1]
      ? `${activeYearRange[0]}`
      : `${activeYearRange[0]}-${activeYearRange[1]}`;
    setShowTrendConcordanceModal(true);
    setTrendConcordanceYear(year);
    setTrendConcordanceRangeLabel(rangeLabel);
    setTrendConcordanceRows([]);
    setTrendConcordanceContext(null);
    setTrendConcordanceError(null);
    setTrendConcordanceStatus(`Laster konkordanser for ${rangeLabel}...`);

    try {
      const { filteredMetadata, effectiveFilterIds, useFilter } = buildFilterSelection(activeYearRange, false);
      if (filteredMetadata.length === 0) {
        throw new Error(`Ingen dokumenter matcher filteret for ${rangeLabel}.`);
      }

      const geoQuery = parseGeoQuery(queryText);
      if (geoQuery.invalid) {
        throw new Error('Ugyldig geo-søk for trenddrilldown.');
      }

      const hasQuotedPhrase = /^"[^"]+"$/.test(queryText);
      const normalizedQuery = hasQuotedPhrase ? queryText.slice(1, -1).trim() : queryText;
      const words = normalizedQuery.split(/\s+/).filter(Boolean);
      let parsedTermGroups: string[][] | null = null;
      const termGroupsSource = termGroupsInput.trim() || (queryText.includes('[') ? queryText : '');
      const autoTermGroups =
        !termGroupsInput.trim() && !queryText.includes('[') && words.length >= 1
          ? toSingleTermGroups(normalizedQuery)
          : null;

      if (termGroupsSource) {
        parsedTermGroups = parseTermGroups(termGroupsSource);
      }

      const effectiveTermGroups = (geoQuery.terms || geoQuery.termGroups) ? null : (parsedTermGroups ?? autoTermGroups);
      if (!effectiveTermGroups && !geoQuery.terms && !geoQuery.termGroups) {
        throw new Error('Ingen gyldig søkestruktur for trenddrilldown.');
      }

      const normalizedNearWindow = Math.max(1, Math.floor(nearWindow) || 1);
      const normalizedBefore = Math.max(0, Math.floor(beforeWindow) || 0);
      const normalizedAfter = Math.max(0, Math.floor(afterWindow) || 0);
      const normalizedOrQueryBefore = Math.max(1, normalizedBefore);
      const normalizedOrQueryAfter = Math.max(1, normalizedAfter);
      const normalizedPerBook = Math.max(1, Math.floor(perBook) || 1);
      const normalizedDocSamples = Math.max(0, Math.floor(docSamples) || 0);
      const normalizedTotalLimit = Math.max(1, Math.floor(totalLimit) || 1);
      const normalizedOrQueryTotalLimit = Math.min(normalizedTotalLimit, 5000);
      const normalizedMaxVariants = Math.max(1, Math.floor(maxVariants) || 1);
      const effectiveMatchMode: 'sequence' | 'near' = hasQuotedPhrase ? 'sequence' : 'near';
      const usesOrQuery = !!effectiveTermGroups && effectiveTermGroups.length === 1;
      const usesInlineTermGroups = !!parsedTermGroups && !termGroupsInput.trim() && queryText.includes('[');
      const usesAutoPhraseTermGroups = !!autoTermGroups && words.length >= 2;
      const usesFastNearProfile = usesInlineTermGroups || usesAutoPhraseTermGroups;
      const effectiveTotalLimit = usesFastNearProfile ? Math.min(normalizedTotalLimit, 100) : normalizedTotalLimit;
      const effectiveMaxVariants = usesFastNearProfile ? Math.min(normalizedMaxVariants, 6) : normalizedMaxVariants;
      const endpointPath = geoQuery.termGroups
        ? "near_query"
        : geoQuery.terms
        ? "or_query"
        : usesOrQuery
        ? "or_query"
        : "near_fragments";

      const requestBody = geoQuery.termGroups
        ? {
            termGroups: geoQuery.termGroups,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            mode: 'render',
            perBook: normalizedPerBook,
            totalLimit: effectiveTotalLimit,
            docSamples: normalizedDocSamples,
            schema: "unigrams",
            symmetric: isSymmetric,
            excludeSelf: false,
            window: normalizedNearWindow,
            before: normalizedBefore,
            after: normalizedAfter
          }
        : geoQuery.terms
        ? {
            terms: geoQuery.terms,
            before: normalizedOrQueryBefore,
            after: normalizedOrQueryAfter,
            docSamples: normalizedDocSamples,
            totalLimit: normalizedOrQueryTotalLimit,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            renderHits: true
          }
        : endpointPath === "near_fragments"
        ? {
            termGroups: effectiveTermGroups,
            matchMode: effectiveMatchMode,
            window: normalizedNearWindow,
            before: normalizedBefore,
            after: normalizedAfter,
            perBook: normalizedPerBook,
            docSamples: normalizedDocSamples,
            totalLimit: effectiveTotalLimit,
            schema: "unigrams",
            symmetric: isSymmetric,
            excludeSelf: false,
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            maxVariants: effectiveMaxVariants,
            engine: "python"
          }
        : {
            termGroups: effectiveTermGroups,
            before: normalizedOrQueryBefore,
            after: normalizedOrQueryAfter,
            perBook: normalizedPerBook,
            docSamples: normalizedDocSamples,
            totalLimit: normalizedOrQueryTotalLimit,
            schema: "unigrams",
            useFilter,
            filterIds: useFilter ? effectiveFilterIds : [],
            maxVariants: effectiveMaxVariants
          };

      const runSearchRequest = (body: Record<string, unknown>) => fetch(`https://api.nb.no/dhlab/imag/${endpointPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const fallbackGeoToken = geoQuery.terms && geoQuery.terms.length === 1
        ? getNbGeoFallbackToken(geoQuery.terms[0])
        : null;
      const buildFallbackRequestBody = (token: string) => ({
        ...requestBody,
        terms: [token]
      } as typeof requestBody);

      let activeRequestBody: typeof requestBody = requestBody;
      let activeGeoToken = geoQuery.terms?.[0] ?? null;
      let geoFallbackApplied = false;

      let concResp = await runSearchRequest(activeRequestBody);
      if (!concResp.ok && concResp.status === 404 && fallbackGeoToken && activeGeoToken !== fallbackGeoToken) {
        activeRequestBody = buildFallbackRequestBody(fallbackGeoToken);
        activeGeoToken = fallbackGeoToken;
        geoFallbackApplied = true;
        concResp = await runSearchRequest(activeRequestBody);
      }

      if (!concResp.ok) {
        const errorText = await concResp.text();
        if (concResp.status === 404) {
          throw new Error(errorText || `Ingen konkordanser funnet for ${rangeLabel}.`);
        }
        throw new Error(`HTTP error ${concResp.status}: ${errorText}`);
      }

      let conc: ConcordanceResponse = await concResp.json();
      if (geoQuery.terms && !geoFallbackApplied && fallbackGeoToken && activeGeoToken !== fallbackGeoToken) {
        const currentRows = Array.isArray(conc.rows) ? conc.rows : [];
        const currentRenderedRows = Array.isArray(conc.rendered) ? conc.rendered : [];
        if (currentRows.length === 0 && currentRenderedRows.length === 0) {
          activeRequestBody = buildFallbackRequestBody(fallbackGeoToken);
          activeGeoToken = fallbackGeoToken;
          geoFallbackApplied = true;
          const fallbackResp = await runSearchRequest(activeRequestBody);
          if (fallbackResp.ok) {
            conc = await fallbackResp.json();
          }
        }
      }

      const rows = Array.isArray(conc.rows) ? conc.rows : [];
      const renderedRows = Array.isArray(conc.rendered) ? conc.rendered : [];
      const mergedRows = geoQuery.terms && renderedRows.length > 0
        ? rows.map((row, index) => {
            const renderedMatch = renderedRows.find((renderedRow) =>
              renderedRow.bookId === row.bookId &&
              renderedRow.pos === row.pos
            ) || renderedRows[index];
            const mergedFrag = renderedMatch?.frag;
            const mergedFragHtml = mergeGeoRenderedFragment(row, mergedFrag);
            return {
              ...row,
              frag: mergedFrag ?? row.frag,
              fragRaw: mergedFrag ?? row.fragRaw,
              fragHtml: mergedFragHtml ?? row.fragHtml
            };
          })
        : rows;

      if (mergedRows.length === 0) {
        throw new Error(`Ingen konkordanser funnet for ${rangeLabel}.`);
      }

      setTrendConcordanceRows(mergedRows);
      setTrendConcordanceContext({
        trimmedQuery: queryText,
        normalizedBefore,
        normalizedAfter,
        normalizedNearWindow,
        extraGeoTermsText: geoQuery.extraTermsText
      });
      setTrendConcordanceStatus(
        `Fant ${mergedRows.length} konkordanser for "${queryText}" i ${rangeLabel} ` +
        `(utvalg: ${new Set(mergedRows.map((row) => row.bookId)).size} dokumenter).`
      );
    } catch (error) {
      setTrendConcordanceError(error instanceof Error ? error.message : 'Ukjent feil');
      setTrendConcordanceStatus('');
      setTrendConcordanceRows([]);
      setTrendConcordanceContext(null);
    }
  };

  const handleCorpusUploadClick = () => {
    fileInputRef.current?.click();
  };

  const restoreBaseCorpus = (statusMessage: string) => {
    const baseMetadata = baseMetadataArrayRef.current;
    if (baseMetadata.length === 0) {
      setStatus('Kunne ikke hente tilbake ImagiNation-korpuset.');
      return;
    }

    const authors = Array.from(new Set(
      baseMetadata
        .map((item) => item.author)
        .filter((author): author is string => !!author)
    )).sort();

    setMetadataArray(baseMetadata);
    setPersistentFilterIds(null);
    setUniqueAuthors(authors);
    setSelectedAuthors([]);
    setAuthorSearch('');
    setSelectedCategories(['All Categories']);
    setYearRange([MIN_YEAR, MAX_YEAR]);
    setResults(null);
    setLastConcordanceRows([]);
    setTrendRows(null);
    setTrendQuery('');
    setTrendHoverRow(null);
    setTrendComparisonSeries(null);
    setTrendComparisonHover(null);
    setHiddenTrendTerms([]);
    setDebugRequest(null);
    setDebugInfo(null);
    setStatus(statusMessage);
  };

  const handleClearUploadedCorpus = () => {
    restoreBaseCorpus(
      `Tilbake til ImagiNation-korpuset (${baseMetadataArrayRef.current.length} dokumenter).`
    );
  };

  const handleCorpusFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('No sheets found in workbook.');
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const normalizedRows = rows.map((row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value])
      ));
      const uploadedId = (row: Record<string, unknown>) => {
        const value = row.id ?? row.dhlabid ?? row.bookid;
        if (value === null || value === undefined || value === '') return Number.NaN;
        return Number(value);
      };
      const urnsWithoutIds = normalizedRows
        .filter((row) => !Number.isFinite(uploadedId(row)))
        .map((row) => String(row.urn ?? '').trim())
        .filter(Boolean);
      const idsWithoutLocalMetadata = normalizedRows
        .map(uploadedId)
        .filter((id) => Number.isFinite(id) && !baseMetadataByIdRef.current.has(id));

      let resolvedByUrn = new Map<string, Awaited<ReturnType<typeof resolveDhlabMetadata>>[number]>();
      if (urnsWithoutIds.length > 0) {
        setStatus(`Slår opp ${new Set(urnsWithoutIds.map(normalizeUrn)).size} URN-er i DHlab …`);
        const resolved = await resolveDhlabMetadata(urnsWithoutIds, (completed, total) => {
          setStatus(`Slår opp URN-er i DHlab: ${completed} av ${total} …`);
        });
        resolvedByUrn = new Map(
          resolved.map((item) => [normalizeUrn(item.urn), item])
        );
      }
      let resolvedById = new Map<number, Awaited<ReturnType<typeof resolveDhlabMetadataByIds>>[number]>();
      if (idsWithoutLocalMetadata.length > 0) {
        setStatus(`Henter metadata for ${new Set(idsWithoutLocalMetadata).size} DHlab-ID-er …`);
        const resolved = await resolveDhlabMetadataByIds(idsWithoutLocalMetadata, (completed, total) => {
          setStatus(`Henter metadata fra DHlab: ${completed} av ${total} …`);
        });
        resolvedById = new Map(resolved.map((item) => [item.dhlabid, item]));
      }

      const parsedMetadata = Array.from(new Map(
        normalizedRows
          .map((row): Metadata | null => {
            const directId = uploadedId(row);
            const rawUrn = String(row.urn ?? '').trim();
            const resolved = Number.isFinite(directId)
              ? resolvedById.get(directId)
              : resolvedByUrn.get(normalizeUrn(rawUrn));
            const id = Number.isFinite(directId) ? directId : Number(resolved?.dhlabid);
            if (!Number.isFinite(id)) return null;

            const base = baseMetadataByIdRef.current.get(id);
            const yearValue = row.year;
            return {
              id,
              urn: resolved?.urn || rawUrn || base?.urn || '',
              title: String(row.title ?? '').trim() || resolved?.title || base?.title,
              author: String(row.author ?? row.authors ?? '').trim() || resolved?.author || base?.author,
              category: String(row.category ?? row.literaryform ?? '').trim()
                || resolved?.category
                || base?.category,
              year: yearValue === '' || yearValue === undefined
                ? resolved?.year ?? base?.year
                : yearValue as number | string
            };
          })
          .filter((item): item is Metadata => item !== null)
          .map((item) => [item.id, item] as const)
      ).values());

      if (parsedMetadata.length === 0) {
        throw new Error('Ingen gyldige korpusrader funnet. Forventet id/dhlabid eller URN.');
      }

      const unresolvedUrnCount = new Set(
        urnsWithoutIds
          .map(normalizeUrn)
          .filter((urn) => !resolvedByUrn.has(urn))
      ).size;

      const authors = Array.from(
        new Set(
          parsedMetadata
            .map((item) => item.author)
            .filter((author): author is string => !!author)
        )
      ).sort();

      setMetadataArray(parsedMetadata);
      setPersistentFilterIds(parsedMetadata.map((item) => item.id));
      setUniqueAuthors(authors);
      setSelectedAuthors([]);
      setAuthorSearch('');
      setSelectedCategories(['All Categories']);
      setYearRange([MIN_YEAR, MAX_YEAR]);
      setResults(null);
      setLastConcordanceRows([]);
      setTrendRows(null);
      setTrendQuery('');
      setTrendHoverRow(null);
      setDebugRequest(null);
      setDebugInfo(null);
      setStatus(
        `Lastet metadata for ${parsedMetadata.length} dokumenter fra «${file.name}».`
        + (unresolvedUrnCount > 0 ? ` ${unresolvedUrnCount} URN-er ble ikke funnet.` : '')
      );
    } catch (error) {
      setStatus(`Error loading corpus file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      e.target.value = '';
    }
  };

  const prepareExportContext = (queryText: string) => {
    const trimmedQuery = queryText.trim();
    if (!trimmedQuery) {
      throw new Error('Skriv inn og kjør et søk før du eksporterer.');
    }
    if (isObviouslyBroadExportQuery(trimmedQuery)) {
      throw new Error('Dette søket er for bredt for batch-eksport. Legg til ord eller snevre inn subkorpuset.');
    }
    if (parseResolvableGeoInput(trimmedQuery)) {
      throw new Error('Velg først et konkret sted i Konk, Telling eller Trend før eksport.');
    }

    const geoQuery = parseGeoQuery(trimmedQuery);
    if (geoQuery.invalid) {
      throw new Error('Geo-søket er ugyldig.');
    }

    const hasQuotedPhrase = /^"[^"]+"$/.test(trimmedQuery);
    const normalizedQuery = hasQuotedPhrase ? trimmedQuery.slice(1, -1).trim() : trimmedQuery;
    const words = normalizedQuery.split(/\s+/).filter(Boolean);
    const termGroupsSource = termGroupsInput.trim() || (trimmedQuery.includes('[') ? trimmedQuery : '');
    const parsedTermGroups = termGroupsSource ? parseTermGroups(termGroupsSource) : null;
    const autoTermGroups =
      !termGroupsInput.trim() && !trimmedQuery.includes('[') && words.length >= 1
        ? toSingleTermGroups(normalizedQuery)
        : null;
    const effectiveTermGroups =
      geoQuery.terms || geoQuery.termGroups ? null : (parsedTermGroups ?? autoTermGroups);
    const exportTermGroups = geoQuery.termGroups ?? effectiveTermGroups;

    if (!geoQuery.terms && (!exportTermGroups || exportTermGroups.length === 0)) {
      throw new Error('Fant ingen gyldige søkegrupper for eksport.');
    }

    const { filteredMetadata, effectiveFilterIds, useFilter } = buildFilterSelection(yearRange, false);
    if (filteredMetadata.length === 0) {
      throw new Error('Ingen dokumenter matcher det aktive subkorpuset.');
    }

    const normalized = normalizeSearchParameters({
      resultMode: 'render',
      perBook,
      docSamples,
      totalLimit,
      nearWindow,
      beforeWindow,
      afterWindow,
      maxVariants
    });

    return {
      requestContext: {
        terms: geoQuery.terms,
        termGroups: exportTermGroups,
        useFilter,
        filterIds: effectiveFilterIds,
        nearWindow: normalized.nearWindow,
        beforeWindow: normalized.beforeWindow,
        afterWindow: normalized.afterWindow,
        maxVariants: normalized.maxVariants,
        symmetric: isSymmetric,
        matchMode: hasQuotedPhrase ? 'sequence' as const : 'near' as const
      },
      filteredMetadata,
      trimmedQuery
    };
  };

  const handleFullCsvExport = async () => {
    let prepared: ReturnType<typeof prepareExportContext>;
    try {
      prepared = prepareExportContext(query);
    } catch (error) {
      setExportStatus(`Feil: ${error instanceof Error ? error.message : 'Ukjent eksportfeil'}`);
      return;
    }

    const controller = new AbortController();
    exportAbortControllerRef.current = controller;
    setIsExporting(true);
    setExportStatus('Teller treff før eksport ...');

    try {
      const countRequest = buildCountRequest(prepared.requestContext);
      const countResponse = await fetch(
        `https://api.nb.no/dhlab/imag/${countRequest.endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(countRequest.body),
          signal: controller.signal
        }
      );
      if (!countResponse.ok) {
        throw new Error(`Telling feilet (${countResponse.status}): ${await countResponse.text()}`);
      }
      const countPayload: CountResponse = await countResponse.json();
      const total = typeof countPayload.total === 'number' ? countPayload.total : 0;
      setEstimatedExportTotal(total);

      if (!isExportWithinLimit(total)) {
        setExportStatus(
          `Eksport blokkert: søket har ${numberFormatter.format(total)} treff. ` +
          `Snevre inn søket eller subkorpuset til høyst ${numberFormatter.format(FULL_EXPORT_LIMIT)} treff.`
        );
        return;
      }
      if (total === 0) {
        setExportStatus('Ingen konkordanser å eksportere.');
        return;
      }

      const confirmed = window.confirm(
        `Hent ${numberFormatter.format(total)} konkordanser som CSV? ` +
        `Eksporten bruker det aktive subkorpuset og kan ta litt tid.`
      );
      if (!confirmed) {
        setExportStatus('Eksport avbrutt før nedlasting.');
        return;
      }

      setExportStatus(`Henter opptil ${numberFormatter.format(FULL_EXPORT_LIMIT)} konkordanser ...`);
      const exportRequest = buildFullExportRequest(prepared.requestContext);
      const exportResponse = await fetch(
        `https://api.nb.no/dhlab/imag/${exportRequest.endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exportRequest.body),
          signal: controller.signal
        }
      );
      if (!exportResponse.ok) {
        throw new Error(`Konkordanshenting feilet (${exportResponse.status}): ${await exportResponse.text()}`);
      }

      const payload: ConcordanceResponse = await exportResponse.json();
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const metadataById = new Map(
        prepared.filteredMetadata.map((metadata) => [Number(metadata.id), metadata])
      );
      const exportRows: ConcordanceExportRow[] = rows.map((row) => {
        const metadata = metadataById.get(Number(row.bookId));
        return {
          dhlabid: row.bookId,
          pos: typeof row.pos === 'number' ? row.pos : '',
          frag: row.fragRaw ?? row.frag ?? row.surfaceText ?? '',
          urn: metadata?.urn ?? '',
          title: metadata?.title ?? '',
          author: metadata?.author ?? '',
          year: metadata?.year ?? '',
          category: metadata?.category ?? ''
        };
      });

      const dateStamp = new Date().toISOString().slice(0, 10);
      downloadCsv(
        exportRows,
        `konkordanser-${safeFilenamePart(prepared.trimmedQuery)}-${dateStamp}.csv`
      );
      const possibleTruncation = rows.length >= FULL_EXPORT_LIMIT || rows.length !== total;
      setExportStatus(
        possibleTruncation
          ? `Lastet ned ${numberFormatter.format(rows.length)} rader. Antallet avviker fra tellingen; kontroller om uttrekket er avkortet.`
          : `Lastet ned et komplett sett på ${numberFormatter.format(rows.length)} konkordanser.`
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportStatus('Eksporten ble avbrutt.');
      } else {
        setExportStatus(`Feil: ${error instanceof Error ? error.message : 'Ukjent eksportfeil'}`);
      }
    } finally {
      exportAbortControllerRef.current = null;
      setIsExporting(false);
    }
  };

  const handleCancelExport = () => {
    exportAbortControllerRef.current?.abort();
  };

  const handleDownloadConcordance = () => {
    if (lastConcordanceRows.length === 0) {
      alert('No concordance results to download yet.');
      return;
    }

    const rows = lastConcordanceRows.map((row) => {
      const metadata = metadataArray.find((item) => item.id === row.bookId);
      return {
        dhlabid: row.bookId,
        pos: row.pos,
        frag: row.frag,
        urn: metadata?.urn ?? '',
        title: metadata?.title ?? '',
        author: metadata?.author ?? '',
        year: metadata?.year ?? '',
        category: metadata?.category ?? ''
      };
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Concordance');
    XLSX.writeFile(workbook, `concordance-${dateStamp}.xlsx`);
  };

  const handleDownloadTrendImage = async () => {
    const svg = trendExportRef.current?.querySelector('svg');
    if (!svg) {
      setExportStatus('Feil: Ingen trendgraf er klar for eksport.');
      return;
    }

    setIsExporting(true);
    setExportStatus('Lager JPG av trendgrafen …');
    try {
      const scaleLabel = trendScaleMode === 'relative'
        ? 'relativ'
        : trendScaleMode === 'cohort'
          ? 'kohort'
          : 'absolutt';
      const smoothingLabel = trendSmoothingMode === 'five-year' ? '5-årig' : 'årlig';
      const dateStamp = new Date().toISOString().slice(0, 10);
      await downloadTrendChartJpeg(
        svg,
        `trend-${safeFilenamePart(trendQuery || query)}-${dateStamp}.jpg`,
        {
          title: `${trendQuery || query} – ${scaleLabel}, ${smoothingLabel}`,
          legend: trendComparisonSeries
            ?.map((series, index) => ({
              label: series.term,
              color: TREND_COLORS[index % TREND_COLORS.length]
            }))
            .filter((item) => !hiddenTrendTerms.includes(item.label))
        }
      );
      setExportStatus('Trendgrafen er lastet ned som JPG.');
    } catch (error) {
      setExportStatus(`Feil: ${error instanceof Error ? error.message : 'Kunne ikke eksportere trendgrafen.'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleConcordanceClick = (metadata: Metadata | undefined, link: string) => {
    if (metadata) {
      setModalData({
        title: metadata.title || "Unknown Title",
        author: metadata.author || "Unknown Author",
        year: metadata.year !== undefined ? String(metadata.year) : "Unknown Year",
        category: metadata.category || "Unknown Category",
        dhlabid: String(metadata.id),
        link: link
      });
      setShowModal(true);
    }
  };

  const handleAuthorSelect = (author: string) => {
    if (!selectedAuthors.includes(author)) {
      setSelectedAuthors([...selectedAuthors, author]);
    }
    setAuthorSearch('');
  };

  const handleAuthorRemove = (authorToRemove: string) => {
    setSelectedAuthors(selectedAuthors.filter(author => author !== authorToRemove));
  };

  const filteredAuthors = uniqueAuthors.filter(author => 
    author.toLowerCase().includes(authorSearch.toLowerCase())
  ).slice(0, 10); // Limit to 10 suggestions

  const handleCategoryToggle = (category: string) => {
    if (category === 'All Categories') {
      setSelectedCategories(['All Categories']);
      return;
    }

    const withoutAll = selectedCategories.filter((value) => value !== 'All Categories');
    const nextCategories = withoutAll.includes(category)
      ? withoutAll.filter((value) => value !== category)
      : [...withoutAll, category];

    setSelectedCategories(nextCategories.length > 0 ? nextCategories : ['All Categories']);
  };

  const buildConcordanceResults = (rows: ConcordanceRow[], context: RenderResultContext): React.ReactNode[] => {
    return rows.map((row, index) => {
      const textHtml = row.fragHtml ? withGeoAnnotationTitles(row.fragHtml) : null;
      const textRaw = row.fragRaw ?? row.frag ?? '';
      const metadata = metadataArray.find(item => item.id === row.bookId);
      const nbProximity = Math.max(context.normalizedBefore, context.normalizedAfter);
      const baseSearchExpression = `"${context.trimmedQuery}"~${nbProximity}`;
      const baseUrnLink = buildNationalLibraryLink(metadata?.urn, baseSearchExpression);

      return (
        <div
          key={index}
          className="concordance"
          data-book-id={row.bookId}
          onClick={(event) => {
            if (!metadata) return;
            const target = event.target as HTMLElement;
            const annotationEl = target.closest('annotation[data-layer="geo"]') as HTMLElement | null;

            if (annotationEl) {
              const geoSearchTerm = annotationEl.textContent?.trim() || context.trimmedQuery;
              const extraGeoTerm = context.extraGeoTermsText;
              const escapedGeoTerm = geoSearchTerm.replace(/"/g, '\\"').trim();
              const escapedExtraTerm = extraGeoTerm ? extraGeoTerm.replace(/"/g, '\\"').trim() : null;
              const geoSearchExpression = escapedExtraTerm
                ? `"${escapedGeoTerm} ${escapedExtraTerm}"~${context.normalizedNearWindow}`
                : escapedGeoTerm;
              const geoUrnLink = buildNationalLibraryLink(metadata.urn, geoSearchExpression);
              handleConcordanceClick(metadata, geoUrnLink);
              return;
            }

            handleConcordanceClick(metadata, baseUrnLink);
          }}
          role="button"
          tabIndex={metadata ? 0 : -1}
          onKeyDown={(event) => {
            if (metadata && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              handleConcordanceClick(metadata, baseUrnLink);
            }
          }}
        >
          {debugEnabled && (
            <div className="concordance__debug">
              dhlabid: {row.bookId}
            </div>
          )}
          {textHtml
            ? <p dangerouslySetInnerHTML={{ __html: textHtml }} />
            : textRaw
              ? <p>{textRaw}</p>
              : <p className="empty-fragment">Ingen fragmenttekst fra backend.</p>}
        </div>
      );
    });
  };

  const activeCorpus = buildFilterSelection(yearRange, false);
  const sourceLabel = persistentFilterIds ? 'Opplastet subkorpus' : 'ImagiNation-korpuset';
  const tokensByYear = corpusTokenStats?.tokensByYear ?? {};
  const displayedTrendRows = scaleSingleTrendRows(trendRows ?? [], trendScaleMode, tokensByYear);
  const displayedComparisonSeries = scaleComparisonTrendSeries(
    trendComparisonSeries ?? [],
    trendScaleMode,
    tokensByYear
  );
  const trendLineRows = trendSmoothingMode === 'annual'
    ? displayedTrendRows
    : smoothSingleTrendRows(trendRows ?? [], trendScaleMode, tokensByYear);
  const comparisonLineSeries = trendSmoothingMode === 'annual'
    ? displayedComparisonSeries
    : smoothComparisonTrendSeries(trendComparisonSeries ?? [], trendScaleMode, tokensByYear);
  const displayedTrendHover = trendHoverRow
    ? displayedTrendRows.find((row) => row.year === trendHoverRow.year) ?? null
    : null;
  const displayedComparisonHover = trendComparisonHover
    ? {
        term: trendComparisonHover.term,
        row: displayedComparisonSeries
          .find((series) => series.term === trendComparisonHover.term)
          ?.rows.find((row) => row.year === trendComparisonHover.row.year)
      }
    : null;
  const validDisplayedComparisonHover = displayedComparisonHover?.row
    ? { term: displayedComparisonHover.term, row: displayedComparisonHover.row }
    : null;
  const handleTrendScaleChange = (nextMode: TrendScaleMode) => {
    if (nextMode === 'relative' && tokenStatsStatus !== 'ready') return;
    if (nextMode === 'cohort' && (trendComparisonSeries?.length ?? 0) < 2) return;
    trendScalePreferenceRef.current = nextMode;
    setTrendScaleMode(nextMode);
    setTrendHoverRow(null);
    setTrendComparisonHover(null);
  };
  const parameterModeLabel = resultMode === 'render'
    ? 'Konk'
    : resultMode === 'count'
      ? 'telling'
      : 'trend';
  const panelTitles: Record<WorkspacePanelId, string> = {
    corpus: 'Subkorpus',
    parameters: `Parametre for ${parameterModeLabel}`,
    export: 'Eksport',
    help: 'Hjelp'
  };

  const renderActivePanel = () => {
    if (activePanel === 'corpus') {
      return (
        <CorpusPanel
          sourceLabel={sourceLabel}
          hasUploadedCorpus={persistentFilterIds !== null}
          selectedDocuments={activeCorpus.filteredMetadata.length}
          totalDocuments={metadataArray.length}
          selectedAuthors={selectedAuthors}
          selectedCategories={selectedCategories}
          categories={CATEGORIES}
          yearRange={yearRange}
          fullYearRange={[MIN_YEAR, MAX_YEAR]}
          authorSearch={authorSearch}
          authorSuggestions={filteredAuthors}
          onAuthorSearchChange={setAuthorSearch}
          onAuthorSelect={handleAuthorSelect}
          onAuthorRemove={handleAuthorRemove}
          onCategoryToggle={handleCategoryToggle}
          onYearChange={(boundary, value) => {
            setYearRange(boundary === 'min' ? [value, yearRange[1]] : [yearRange[0], value]);
          }}
          onReset={() => {
            setSelectedAuthors([]);
            setSelectedCategories(['All Categories']);
            setYearRange([MIN_YEAR, MAX_YEAR]);
          }}
          onUpload={handleCorpusUploadClick}
          onClearUpload={handleClearUploadedCorpus}
        />
      );
    }
    if (activePanel === 'parameters') {
      return (
        <SearchSettingsPanel
          query={query}
          resultMode={resultMode}
          perBook={perBook}
          docSamples={docSamples}
          totalLimit={totalLimit}
          nearWindow={nearWindow}
          beforeWindow={beforeWindow}
          afterWindow={afterWindow}
          maxVariants={maxVariants}
          termGroupsInput={termGroupsInput}
          isSymmetric={isSymmetric}
          onPerBookChange={setPerBook}
          onDocSamplesChange={setDocSamples}
          onTotalLimitChange={setTotalLimit}
          onNearWindowChange={setNearWindow}
          onBeforeWindowChange={setBeforeWindow}
          onAfterWindowChange={setAfterWindow}
          onMaxVariantsChange={setMaxVariants}
          onTermGroupsInputChange={setTermGroupsInput}
          onSymmetricChange={setIsSymmetric}
        />
      );
    }
    if (activePanel === 'export') {
      return (
        <ExportPanel
          contentType={
            (trendComparisonSeries && trendComparisonSeries.length > 0) || (trendRows && trendRows.length > 0)
              ? 'trend'
              : lastConcordanceRows.length > 0
                ? 'concordance'
                : 'none'
          }
          query={query}
          selectedDocuments={activeCorpus.filteredMetadata.length}
          previewRows={lastConcordanceRows.length}
          estimatedTotal={estimatedExportTotal}
          exportStatus={exportStatus}
          isExporting={isExporting}
          canExport={query.trim().length > 0 && activeCorpus.filteredMetadata.length > 0}
          onDownloadPreview={handleDownloadConcordance}
          onDownloadFull={() => { void handleFullCsvExport(); }}
          onDownloadTrendImage={() => { void handleDownloadTrendImage(); }}
          onCancelExport={handleCancelExport}
        />
      );
    }
    if (activePanel === 'help') {
      return (
        <div className="settings-stack help-content">
          <Alert data-color="info">
            Start gjerne med Telling eller Trend. Bruk Konk for å kontrollere et sample før du eksporterer.
          </Alert>
          <Paragraph><strong>Vanlig søk:</strong> <code>norge</code> eller <code>norge sverige</code>.</Paragraph>
          <Paragraph><strong>Frase:</strong> <code>&quot;norge i krig&quot;</code> krever samme rekkefølge.</Paragraph>
          <Paragraph><strong>Wildcard:</strong> <code>elskov*</code> finner flere bøyninger og skrivemåter.</Paragraph>
          <Paragraph>
            <strong>OR-gruppe:</strong> <code>[elskov, kjærlighed] kvinne</code> er ett søk:
            elskov eller kjærlighed nær kvinne. Det gir én samlet telling eller trend.
          </Paragraph>
          <Paragraph>
            <strong>Sammenligning:</strong> <code>{'{elskov kvinne; kjærlighed kvinne}'}</code> gir separate
            tellinger eller trendlinjer for de komplette søkene. Bruk semikolon mellom søkene.
          </Paragraph>
          <Paragraph><strong>Sted:</strong> <code>#geo krig</code>, <code>#geo:&quot;Rio de Janeiro&quot;</code> eller <code>#geo:1032414</code>.</Paragraph>
          <Paragraph><strong>Eksport:</strong> komplett CSV krever høyst {FULL_EXPORT_LIMIT.toLocaleString('nb-NO')} treff.</Paragraph>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDebugEnabled(!debugEnabled)}
          >
            {debugEnabled ? 'Skjul debug' : 'Vis debug'}
          </Button>
          {debugEnabled ? (
            <details className="debug-panel" open>
              <summary>Teknisk request og respons</summary>
              <pre>{JSON.stringify({ request: debugRequest, info: debugInfo }, null, 2)}</pre>
            </details>
          ) : null}
          <Paragraph data-size="xs" className="app-version-detail">
            ImagiNation korpusutforsker v{APP_VERSION} · bygg {APP_COMMIT}
          </Paragraph>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <a className="skip-link" href="#search-workspace">Hopp til søk</a>
      <header className="app-header">
        <div className="app-header__content">
          <div>
            <span className="app-kicker">Digitalt korpusverktøy</span>
            <Heading level={1} data-size="md">ImagiNation korpusutforsker</Heading>
          </div>
          <div className="app-header__meta">
            <span className="header-corpus-count">
              {activeCorpus.filteredMetadata.length.toLocaleString('nb-NO')} dokumenter
            </span>
            <span className="app-version" title={`Versjon ${APP_VERSION}, bygg ${APP_COMMIT}`}>
              v{APP_VERSION} · {APP_COMMIT}
            </span>
          </div>
        </div>
      </header>

      <main className={`app-workspace${activePanel ? ' app-workspace--panel-open' : ''}`}>
        <PanelRail
          activePanel={activePanel}
          documentCount={activeCorpus.filteredMetadata.length}
          exportCount={estimatedExportTotal}
          buttonRefs={panelButtonRefs}
          onToggle={togglePanel}
        />
        {activePanel ? (
          <WorkspacePanel title={panelTitles[activePanel]} onClose={closeActivePanel}>
            {renderActivePanel()}
          </WorkspacePanel>
        ) : null}

        <div className="workspace-main" id="search-workspace">
          <SearchPanel
            query={query}
            resultMode={resultMode}
            comparisonOptions={comparisonOptions}
            selectedComparisonIndex={activeComparisonIndex}
            recentQueries={recentQueries}
            isLoading={isLoading}
            onQueryChange={handleQueryChange}
            onResultModeChange={handleResultModeChange}
            onComparisonChange={handleComparisonChange}
            onSelectRecentQuery={handleQueryChange}
            onImportQueries={(incoming) => {
              setRecentQueries((current) => importSearchQueries(incoming, current));
            }}
            onClearRecentQueries={() => setRecentQueries(clearSearchHistory())}
            onSearch={() => { void performSearch(); }}
          />

          <ResultsPanel status={status} isLoading={isLoading}>
            {lastRenderContext && lastConcordanceRows.length > 0 ? (
              <>
                <Paragraph data-size="sm" className="result-explanation">
                  Konk viser et samplet utvalg. Velg en konkordans for bokinformasjon og lenke til Nettbiblioteket.
                </Paragraph>
                {buildConcordanceResults(lastConcordanceRows, lastRenderContext)}
              </>
            ) : trendComparisonSeries && trendComparisonSeries.length > 0 ? (
              <>
                <TrendScaleControl
                  mode={trendScaleMode}
                  smoothingMode={trendSmoothingMode}
                  showPoints={showTrendPoints}
                  hasComparison
                  tokenStatsStatus={tokenStatsStatus}
                  onChange={handleTrendScaleChange}
                  onSmoothingChange={setTrendSmoothingMode}
                  onShowPointsChange={setShowTrendPoints}
                />
                <div ref={trendExportRef}>
                  {buildComparisonYearCountResults(
                    displayedComparisonSeries,
                    comparisonLineSeries,
                    validDisplayedComparisonHover,
                    (term, row) => setTrendComparisonHover({ term, row }),
                    () => setTrendComparisonHover(null),
                    (term, year, span) => {
                      setTrendComparisonHover(null);
                      void openTrendConcordancesForYear(year, term, span);
                    },
                    trendScaleMode,
                    trendSmoothingMode,
                    showTrendPoints,
                    trendComparisonNotice,
                    new Set(hiddenTrendTerms),
                    (term) => {
                      setHiddenTrendTerms((current) => (
                        current.includes(term)
                          ? current.filter((item) => item !== term)
                          : [...current, term]
                      ));
                      setTrendComparisonHover((current) => (
                        current?.term === term ? null : current
                      ));
                    }
                  )}
                </div>
              </>
            ) : trendRows && trendRows.length > 0 ? (
              <>
                <TrendScaleControl
                  mode={trendScaleMode}
                  smoothingMode={trendSmoothingMode}
                  showPoints={showTrendPoints}
                  hasComparison={false}
                  tokenStatsStatus={tokenStatsStatus}
                  onChange={handleTrendScaleChange}
                  onSmoothingChange={setTrendSmoothingMode}
                  onShowPointsChange={setShowTrendPoints}
                />
                <div ref={trendExportRef}>
                  {buildYearCountResults(
                    displayedTrendRows,
                    trendLineRows,
                    (year, span) => {
                      setTrendHoverRow(null);
                      void openTrendConcordancesForYear(year, trendQuery, span);
                    },
                    displayedTrendHover,
                    (row) => setTrendHoverRow(row),
                    () => setTrendHoverRow(null),
                    trendScaleMode,
                    trendSmoothingMode,
                    showTrendPoints
                  )}
                </div>
              </>
            ) : (
              results ?? <Paragraph>Skriv inn et søk for å se resultater.</Paragraph>
            )}
          </ResultsPanel>

          <input
            ref={fileInputRef}
            className="visually-hidden-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleCorpusFileChange}
            tabIndex={-1}
          />
        </div>
      </main>

      <Dialog open={showModal} onClose={() => setShowModal(false)} closedby="any">
        <DialogBlock>
          <Heading level={2} data-size="md">{modalData?.title || 'Bokinformasjon'}</Heading>
        </DialogBlock>
        <DialogBlock>
          <dl className="metadata-list">
            <div><dt>Forfatter</dt><dd>{modalData?.author}</dd></div>
            <div><dt>År</dt><dd>{modalData?.year}</dd></div>
            <div><dt>Kategori</dt><dd>{modalData?.category}</dd></div>
            <div><dt>dhlabid</dt><dd>{modalData?.dhlabid}</dd></div>
          </dl>
        </DialogBlock>
        <DialogBlock className="dialog-actions">
          {modalData?.link ? (
            <Button asChild>
              <a href={modalData.link} target="_blank" rel="noopener noreferrer">
                Åpne i Nettbiblioteket
              </a>
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Lukk</Button>
        </DialogBlock>
      </Dialog>

      <Dialog
        className="wide-dialog"
        open={showTrendConcordanceModal}
        onClose={() => setShowTrendConcordanceModal(false)}
        closedby="any"
      >
        <DialogBlock>
          <Heading level={2} data-size="md">
            {trendConcordanceYear !== null
              ? `Konkordanser for ${trendConcordanceRangeLabel || trendConcordanceYear}`
              : 'Trend-konkordanser'}
          </Heading>
        </DialogBlock>
        <DialogBlock>
          {trendConcordanceStatus ? <Paragraph data-size="sm">{trendConcordanceStatus}</Paragraph> : null}
          {trendConcordanceError ? (
            <Alert data-color="danger">Trend-konkordans feilet: {trendConcordanceError}</Alert>
          ) : trendConcordanceContext && trendConcordanceRows.length > 0 ? (
            <div className="dialog-results">
              {buildConcordanceResults(trendConcordanceRows, trendConcordanceContext)}
            </div>
          ) : (
            <Paragraph>Laster ...</Paragraph>
          )}
        </DialogBlock>
      </Dialog>

    </>
  );
}

export default App; 