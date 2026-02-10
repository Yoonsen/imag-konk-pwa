import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import * as XLSX from 'xlsx';

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
  pos: number;
  frag: string;
}

interface ConcordanceResponse {
  rows: ConcordanceRow[];
}

interface ModalData {
  title: string;
  author: string;
  year: string;
  category: string;
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

function App() {
  const [metadataArray, setMetadataArray] = useState<Metadata[]>([]);
  const [uniqueAuthors, setUniqueAuthors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All Categories']);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [authorSearch, setAuthorSearch] = useState('');
  const [yearRange, setYearRange] = useState<[number, number]>([MIN_YEAR, MAX_YEAR]);
  const [status, setStatus] = useState('Loading corpus data...');
  const [results, setResults] = useState<React.ReactNode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [lastConcordanceRows, setLastConcordanceRows] = useState<ConcordanceRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setMetadataArray(sanitizedData.dhlabids);
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

  const performSearch = async () => {
    const trimmedQuery = query.trim();
    const words = trimmedQuery.split(/\s+/).filter(Boolean);
    const wordA = words[0] || "";
    const wordB = words.length === 2 ? words[1] : "";

    if (!wordA) {
      alert("Please enter a search term");
      return;
    }

    if (!metadataArray || metadataArray.length === 0) {
      alert("Metadata not loaded yet. Please try again.");
      return;
    }

    setIsLoading(true);
    setStatus("Searching...");
    setResults(null);

    try {
      // Filter URNs by selected categories, authors, and year range
      const filteredMetadata = metadataArray.filter(item => {
        const categoryMatch = selectedCategories.includes('All Categories') || 
          (item.category && selectedCategories.includes(item.category));
        
        const authorMatch = selectedAuthors.length === 0 || 
          (item.author && selectedAuthors.includes(item.author));
        
        const year = Number(item.year ?? 0);
        const yearMatch = year >= yearRange[0] && year <= yearRange[1];
        
        return categoryMatch && authorMatch && yearMatch;
      });

      if (filteredMetadata.length === 0) {
        setStatus("No documents match the selected filters.");
        setResults(<p key="no-filter-results">No documents match the selected filters.</p>);
        return;
      }

      const filterIds = filteredMetadata.map(item => item.id);
      const useFilter = filterIds.length > 0 && filterIds.length < metadataArray.length;

      const concBody = {
        wordA,
        wordB,
        window: 20,
        before: 5,
        after: 5,
        perBook: 3,
        totalLimit: 200,
        schema: "unigrams",
        useFilter,
        filterIds: useFilter ? filterIds : [],
        symmetric: true,
        excludeSelf: false
      };

      const concResp = await fetch("https://api.nb.no/dhlab/imag/concordance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(concBody)
      });

      if (!concResp.ok) {
        const errorText = await concResp.text();
        throw new Error(`HTTP error ${concResp.status}: ${errorText}`);
      }

      const conc: ConcordanceResponse = await concResp.json();
      const categoryText = selectedCategories.includes('All Categories') 
        ? '' 
        : ` in categories: ${selectedCategories.join(', ')}`;
      const authorText = selectedAuthors.length > 0
        ? ` by authors: ${selectedAuthors.join(', ')}`
        : '';
      const yearText = yearRange[0] === MIN_YEAR && yearRange[1] === MAX_YEAR
        ? ''
        : ` from ${yearRange[0]} to ${yearRange[1]}`;
      const rows = Array.isArray(conc.rows) ? conc.rows : [];
      setStatus(`Found ${rows.length} results for "${trimmedQuery}"${categoryText}${authorText}${yearText}`);
      setLastConcordanceRows(rows);

      if (rows.length === 0) {
        setResults(<p key="no-results">No results found for this query.</p>);
        return;
      }

      const newResults = rows.map((row, index) => {
        const text = row.frag;
        const metadata = metadataArray.find(item => item.id === row.bookId);
        const urnLink = metadata?.urn
          ? `https://www.nb.no/items/${metadata.urn}?searchText="${encodeURIComponent(trimmedQuery)}"~1`
          : "#";

        return (
          <div 
            key={index} 
            className="concordance"
            data-book-id={row.bookId}
            onClick={() => metadata && handleConcordanceClick(metadata, urnLink)}
          >
            <p>{text}</p>
          </div>
        );
      });

      setResults(newResults);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setResults(<p key="error" className="error">Search failed: {error instanceof Error ? error.message : 'Unknown error'}</p>);
      setLastConcordanceRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCorpusUploadClick = () => {
    fileInputRef.current?.click();
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

      const parsedMetadata = rows
        .map((row) => {
          const lowerCasedRow = Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value])
          );

          const rawId = lowerCasedRow.id ?? lowerCasedRow.dhlabid ?? lowerCasedRow.bookid;
          const rawUrn = lowerCasedRow.urn;

          const id = Number(rawId);
          const urn = String(rawUrn ?? '').trim();
          const yearValue = lowerCasedRow.year;

          return {
            id,
            urn,
            title: String(lowerCasedRow.title ?? '').trim() || undefined,
            author: String(lowerCasedRow.author ?? '').trim() || undefined,
            category: String(lowerCasedRow.category ?? '').trim() || undefined,
            year: yearValue === '' ? undefined : (yearValue as number | string)
          } as Metadata;
        })
        .filter((item) => Number.isFinite(item.id) && item.urn.length > 0);

      if (parsedMetadata.length === 0) {
        throw new Error('No valid corpus rows found. Expected columns like id/dhlabid, urn, title, author, category, year.');
      }

      const authors = Array.from(
        new Set(
          parsedMetadata
            .map((item) => item.author)
            .filter((author): author is string => !!author)
        )
      ).sort();

      setMetadataArray(parsedMetadata);
      setUniqueAuthors(authors);
      setSelectedAuthors([]);
      setSelectedCategories(['All Categories']);
      setStatus(`Loaded metadata for ${parsedMetadata.length} documents from "${file.name}".`);
    } catch (error) {
      setStatus(`Error loading corpus file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadConcordance = () => {
    if (lastConcordanceRows.length === 0) {
      alert('No concordance results to download yet.');
      return;
    }

    const escapeCsv = (value: string | number | undefined) => {
      const safeValue = String(value ?? '');
      if (safeValue.includes('"') || safeValue.includes(',') || safeValue.includes('\n')) {
        return `"${safeValue.replace(/"/g, '""')}"`;
      }
      return safeValue;
    };

    const header = ['bookId', 'pos', 'frag', 'urn', 'title', 'author', 'year', 'category'];
    const rows = lastConcordanceRows.map((row) => {
      const metadata = metadataArray.find((item) => item.id === row.bookId);
      return [
        row.bookId,
        row.pos,
        row.frag,
        metadata?.urn ?? '',
        metadata?.title ?? '',
        metadata?.author ?? '',
        metadata?.year ?? '',
        metadata?.category ?? ''
      ].map(escapeCsv).join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const dateStamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `concordance-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleConcordanceClick = (metadata: Metadata | undefined, link: string) => {
    if (metadata) {
      setModalData({
        title: metadata.title || "Unknown Title",
        author: metadata.author || "Unknown Author",
        year: metadata.year !== undefined ? String(metadata.year) : "Unknown Year",
        category: metadata.category || "Unknown Category",
        link: link
      });
      setShowModal(true);
    }
  };

  const handleAuthorSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthorSearch(e.target.value);
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

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = e.target.options;
    const selectedValues: string[] = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selectedValues.push(options[i].value);
      }
    }
    
    if (selectedValues.includes('All Categories')) {
      setSelectedCategories(['All Categories']);
    } else {
      setSelectedCategories(selectedValues);
    }
  };

  const handleYearRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (e.target.name === 'minYear') {
      setYearRange([value, yearRange[1]]);
    } else {
      setYearRange([yearRange[0], value]);
    }
  };

  return (
    <div className="container my-4">
      <h1 className="text-center mb-4">ImagiNation Concordances</h1>
      <div className="row justify-content-center mb-3">
        <div className="col-md-8">
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Norge"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && performSearch()}
            />
            <button 
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setShowFilterModal(true)}
            >
              <i className="bi bi-funnel"></i>
            </button>
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={handleCorpusUploadClick}
              title="Upload corpus Excel file"
            >
              <i className="bi bi-file-earmark-arrow-up"></i>
            </button>
            <button 
              className="btn btn-primary"
              onClick={performSearch}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              ) : (
                'Search'
              )}
            </button>
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={handleDownloadConcordance}
              title="Download concordance"
              disabled={lastConcordanceRows.length === 0}
            >
              <i className="bi bi-download"></i>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleCorpusFileChange}
          />
        </div>
      </div>

      <div className="border p-3" style={{ overflowY: "auto", height: "calc(100vh - 200px)" }}>
        <div style={{ fontSize: "12px", marginBottom: "10px", color: "#555" }}>{status}</div>
        {results}
      </div>

      {/* Results Modal */}
      <div className={`modal fade ${showModal ? 'show' : ''}`} 
           style={{ display: showModal ? 'block' : 'none' }} 
           tabIndex={-1} 
           role="dialog">
        <div className="modal-dialog" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{modalData?.title}</h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setShowModal(false)}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <p><strong>Author:</strong> {modalData?.author}</p>
              <p><strong>Year:</strong> {modalData?.year}</p>
              <p><strong>Category:</strong> {modalData?.category}</p>
            </div>
            <div className="modal-footer">
              <a 
                href={modalData?.link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-primary"
              >
                View in National Library
              </a>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Modal */}
      <div className={`modal fade ${showFilterModal ? 'show' : ''}`} 
           style={{ display: showFilterModal ? 'block' : 'none' }} 
           tabIndex={-1} 
           role="dialog">
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Filter Results</h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setShowFilterModal(false)}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <div className="mb-4">
                <label className="form-label">Authors</label>
                <div className="input-group mb-2">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search authors..."
                    value={authorSearch}
                    onChange={handleAuthorSearch}
                  />
                </div>
                {authorSearch && filteredAuthors.length > 0 && (
                  <div className="list-group mb-2">
                    {filteredAuthors.map(author => (
                      <button
                        key={author}
                        className="list-group-item list-group-item-action"
                        onClick={() => handleAuthorSelect(author)}
                      >
                        {author}
                      </button>
                    ))}
                  </div>
                )}
                {selectedAuthors.length > 0 && (
                  <div className="d-flex flex-wrap gap-2">
                    {selectedAuthors.map(author => (
                      <span key={author} className="badge bg-primary d-flex align-items-center">
                        {author}
                        <button
                          type="button"
                          className="btn-close btn-close-white ms-2"
                          onClick={() => handleAuthorRemove(author)}
                          aria-label="Remove"
                        ></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="form-label">Categories</label>
                <select 
                  className="form-select" 
                  multiple
                  value={selectedCategories}
                  onChange={handleCategoryChange}
                  size={5}
                >
                  {CATEGORIES.map((category, index) => (
                    <option key={index} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <small className="text-muted d-block mt-1">
                  Hold Ctrl/Cmd to select multiple categories
                </small>
              </div>

              <div className="mb-3">
                <label className="form-label">Year Range: {yearRange[0]} - {yearRange[1]}</label>
                <div className="d-flex gap-3">
                  <div className="flex-grow-1">
                    <label className="form-label">From</label>
                    <input
                      type="range"
                      className="form-range"
                      min={MIN_YEAR}
                      max={MAX_YEAR}
                      value={yearRange[0]}
                      name="minYear"
                      onChange={handleYearRangeChange}
                    />
                  </div>
                  <div className="flex-grow-1">
                    <label className="form-label">To</label>
                    <input
                      type="range"
                      className="form-range"
                      min={MIN_YEAR}
                      max={MAX_YEAR}
                      value={yearRange[1]}
                      name="maxYear"
                      onChange={handleYearRangeChange}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowFilterModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {showModal && <div className="modal-backdrop fade show"></div>}
      {showFilterModal && <div className="modal-backdrop fade show"></div>}
    </div>
  );
}

export default App; 