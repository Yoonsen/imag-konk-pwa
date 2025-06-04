import React, { useState, useEffect } from 'react';
import './App.css';

interface Metadata {
  urn: string;
  title?: string;
  author?: string;
  year?: string;
  category?: string;
}

interface Concordance {
  conc: { [key: string]: string };
  urn: { [key: string]: string };
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

function App() {
  const [metadataArray, setMetadataArray] = useState<Metadata[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All Categories']);
  const [status, setStatus] = useState('Loading corpus data...');
  const [results, setResults] = useState<JSX.Element[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);

  useEffect(() => {
    const timestamp = new Date().getTime();
    const jsonUrl = `corpus.json?v=${timestamp}`;

    fetch(jsonUrl)
      .then(res => res.json())
      .then(data => {
        const sanitizedData = JSON.parse(
          JSON.stringify(data, (key, value) => 
            typeof value === "number" && isNaN(value) ? null : value
          )
        );

        if (sanitizedData && Array.isArray(sanitizedData.dhlabids)) {
          setMetadataArray(sanitizedData.dhlabids);
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
    if (!query) {
      alert("Please enter a search term");
      return;
    }

    if (!metadataArray || metadataArray.length === 0) {
      alert("Metadata not loaded yet. Please try again.");
      return;
    }

    setIsLoading(true);
    setStatus("Searching...");
    setResults([]);

    try {
      // Filter URNs by selected categories
      const filteredMetadata = selectedCategories.includes('All Categories')
        ? metadataArray
        : metadataArray.filter(item => item.category && selectedCategories.includes(item.category));

      const urnsToUse = filteredMetadata.map(item => item.urn);
      const concBody = {
        urns: urnsToUse,
        query: query,
        limit: 1000,
        window: 20,
        html_formatting: true
      };

      const concResp = await fetch("https://api.nb.no/dhlab/conc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(concBody)
      });

      if (!concResp.ok) {
        const errorText = await concResp.text();
        throw new Error(`HTTP error ${concResp.status}: ${errorText}`);
      }

      const conc: Concordance = await concResp.json();
      const categoryText = selectedCategories.includes('All Categories') 
        ? '' 
        : ` in categories: ${selectedCategories.join(', ')}`;
      setStatus(`Found results for "${query}"${categoryText}`);

      if (!conc.conc || Object.keys(conc.conc).length === 0) {
        setResults([<p key="no-results">No results found for this query.</p>]);
        return;
      }

      const newResults = Object.keys(conc.conc).map((key, index) => {
        const text = conc.conc[key];
        const urn = conc.urn[key];
        const metadata = metadataArray.find(item => item.urn === urn);

        const boldTerms = Array.from(text.matchAll(/<b>(.*?)<\/b>/g)).map(match => match[1]);
        const searchText = boldTerms.join(" ");
        const tokenCount = boldTerms.length;
        const urnLink = `https://www.nb.no/items/${urn}?searchText="${encodeURIComponent(searchText)}"~${tokenCount}`;

        return (
          <div 
            key={index} 
            className="concordance"
            data-urn={urn}
            onClick={() => handleConcordanceClick(metadata, urnLink)}
          >
            <p dangerouslySetInnerHTML={{ __html: text }} />
          </div>
        );
      });

      setResults(newResults);
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setResults([<p key="error" className="error">Search failed: {error instanceof Error ? error.message : 'Unknown error'}</p>]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConcordanceClick = (metadata: Metadata | undefined, link: string) => {
    if (metadata) {
      setModalData({
        title: metadata.title || "Unknown Title",
        author: metadata.author || "Unknown Author",
        year: metadata.year || "Unknown Year",
        category: metadata.category || "Unknown Category",
        link: link
      });
      setShowModal(true);
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = e.target.options;
    const selectedValues: string[] = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selectedValues.push(options[i].value);
      }
    }
    
    // If "All Categories" is selected, deselect other options
    if (selectedValues.includes('All Categories')) {
      setSelectedCategories(['All Categories']);
    } else {
      setSelectedCategories(selectedValues);
    }
  };

  return (
    <div className="container my-4">
      <h1 className="text-center mb-4">ImagiNation Concordances</h1>
      <div className="row justify-content-center mb-3">
        <div className="col-md-8">
          <div className="row g-3">
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
              </div>
            </div>
            <div className="col-md-4">
              <div className="d-flex flex-column">
                <label htmlFor="categorySelect" className="form-label mb-1">Filter by categories:</label>
                <select 
                  id="categorySelect"
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
                <small className="text-muted mt-1">
                  Hold Ctrl/Cmd to select multiple categories
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="border p-3" style={{ overflowY: "auto", height: "calc(100vh - 200px)" }}>
        <div style={{ fontSize: "12px", marginBottom: "10px", color: "#555" }}>{status}</div>
        {results}
      </div>

      {/* Bootstrap Modal */}
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
      {showModal && <div className="modal-backdrop fade show"></div>}
    </div>
  );
}

export default App; 