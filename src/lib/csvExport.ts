export interface ConcordanceExportRow {
  dhlabid: number;
  pos: number | '';
  frag: string;
  urn: string;
  title: string;
  author: string;
  year: number | string;
  category: string;
}

const CSV_COLUMNS: Array<keyof ConcordanceExportRow> = [
  'dhlabid',
  'pos',
  'frag',
  'urn',
  'title',
  'author',
  'year',
  'category'
];

export function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export interface CountExportRow {
  query: string;
  total: number;
  uniqueDocs: number;
}

function buildCsv<T extends object>(columns: Array<keyof T>, rows: T[]): string {
  const header = columns.map(String).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(row[column])).join(',')
  );
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

export function buildConcordanceCsv(rows: ConcordanceExportRow[]): string {
  return buildCsv(CSV_COLUMNS, rows);
}

export function buildCountCsv(rows: CountExportRow[]): string {
  const header = 'query,total,unique_docs';
  const body = rows.map((row) =>
    [row.query, row.total, row.uniqueDocs].map(escapeCsvCell).join(',')
  );
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

export function downloadCsvFile(contents: string, filename: string): void {
  const blob = new Blob([contents], {
    type: 'text/csv;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(rows: ConcordanceExportRow[], filename: string): void {
  downloadCsvFile(buildConcordanceCsv(rows), filename);
}

export function downloadCountCsv(rows: CountExportRow[], filename: string): void {
  downloadCsvFile(buildCountCsv(rows), filename);
}

export function safeFilenamePart(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.slice(0, 48) || 'sok';
}
