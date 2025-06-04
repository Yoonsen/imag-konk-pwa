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

function App() {
  const [metadataArray, setMetadataArray] = useState<Metadata[]>([]);
  const [query, setQuery] = useState('');
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
      const urnsToUse = metadataArray.map(item => item.urn);
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
      setStatus(`Found results for "${query}"`);

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

  return (
    <div className="container my-4">
      <h1 className="text-center mb-4">ImagiNation Concordances</h1>
      <div className="input-group mb-3" style={{ maxWidth: "400px", margin: "0 auto" }}>
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