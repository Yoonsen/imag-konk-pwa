// This will store our extracted metadata
let metadataArray = [];
const statusDiv = document.getElementById("status");
const searchBtn = document.getElementById("searchBtn");
const queryInput = document.getElementById("query");

// Add a timestamp to prevent caching for dynamic resources
const timestamp = new Date().getTime();
const jsonUrl = `corpus.json?v=${timestamp}`;

statusDiv.textContent = "Loading corpus data...";

// Function to sanitize JSON data
function sanitizeJSON(data) {
  return JSON.parse(
    JSON.stringify(data, (key, value) => (typeof value === "number" && isNaN(value) ? null : value))
  );
}

// Load the metadata when the page loads
fetch(jsonUrl)
  .then(res => res.json())
  .then(data => {
    const sanitizedData = sanitizeJSON(data); // Sanitize the JSON data
    console.log("Loaded and sanitized data structure:", sanitizedData);

    if (sanitizedData && Array.isArray(sanitizedData.dhlabids)) {
      metadataArray = sanitizedData.dhlabids; // Store the array of metadata objects
      statusDiv.textContent = `Loaded metadata for ${metadataArray.length} documents.`;
    } else {
      statusDiv.textContent = "Error: No valid metadata array found in JSON.";
      console.error("No valid metadata array in data:", sanitizedData);
    }
  })
  .catch(err => {
    statusDiv.textContent = `Error loading metadata: ${err.message}`;
    console.error("Failed to load metadata:", err);
  });

// Search function
async function performSearch() {
  try {
    const query = queryInput.value.trim();
    const words = query.split(/\s+/).filter(Boolean);
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

    const resultsDiv = document.getElementById("results");
    statusDiv.textContent = "Searching...";
    resultsDiv.innerHTML = "";

    // Add a loading spinner
    const spinner = document.createElement("div");
    spinner.id = "loading-spinner";
    spinner.style.textAlign = "center";
    spinner.innerHTML = `
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    `;
    resultsDiv.appendChild(spinner);

    // Build filter IDs from loaded metadata
    const filterIds = metadataArray.map(item => item.id).filter(Boolean);

    const concBody = {
      wordA,
      wordB,
      window: 20,
      before: 5,
      after: 5,
      perBook: 3,
      totalLimit: 200,
      schema: "unigrams",
      useFilter: filterIds.length > 0,
      filterIds,
      symmetric: true,
      excludeSelf: false
    };

    console.log("Request body:", concBody);

    const concResp = await fetch("https://api.nb.no/dhlab/imag/concordance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(concBody)
    });

    if (!concResp.ok) {
      const errorText = await concResp.text();
      throw new Error(`HTTP error ${concResp.status}: ${errorText}`);
    }

    const conc = await concResp.json();

    // Remove the spinner after fetching
    spinner.remove();

    statusDiv.textContent = `Found results for "${query}"`;

    if (!conc.rows || conc.rows.length === 0) {
      resultsDiv.innerHTML = "<p>No results found for this query.</p>";
      return;
    }

    renderConcordances(conc);
  } catch (error) {
    // Remove the spinner if an error occurs
    const spinner = document.getElementById("loading-spinner");
    if (spinner) spinner.remove();

    statusDiv.textContent = `Error: ${error.message}`;
    document.getElementById("results").innerHTML = `<p class="error">Search failed: ${error.message}</p>`;
    console.error("Search failed:", error);
  }
}

// Render concordances with metadata
function renderConcordances(conc) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = ""; // Clear previous results

  let matchCount = 0;

  conc.rows.forEach(row => {
    const text = row.frag;
    const metadata = metadataArray.find(item => item.id === row.bookId);
    const urn = metadata?.urn;

    // Construct the clickable URL with searchText
    const urnLink = urn
      ? `https://www.nb.no/items/${urn}?searchText="${encodeURIComponent(queryInput.value.trim())}"~1`
      : null;

    // Create the concordance line
    const div = document.createElement("div");
    div.className = "concordance";
    div.setAttribute("data-book-id", String(row.bookId)); // Attach book ID for hover functionality
    div.innerHTML = `<p>${text}</p>`;

    // Add click event to the concordance line
    div.addEventListener("click", () => {
      if (urnLink) {
        console.log(`Concordance clicked: ${row.bookId}`);
        window.open(urnLink, "_blank"); // Open the library page in a new tab
      }
    });

    // Add hover functionality for metadata pop-up
    div.addEventListener("mouseover", event => {
      let tooltip = document.getElementById("metadata-tooltip");
      if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "metadata-tooltip";
        tooltip.style.position = "absolute";
        tooltip.style.backgroundColor = "#fff";
        tooltip.style.border = "1px solid #ccc";
        tooltip.style.padding = "10px";
        tooltip.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
        tooltip.style.zIndex = "1000";
        tooltip.style.cursor = "pointer";
        tooltip.innerHTML = `
          <strong>${metadata?.title || "Unknown Title"}</strong><br>
          <em>${metadata?.author || "Unknown Author"}</em><br>
          <span>${metadata?.year || "Unknown Year"}</span>
        `;
        document.body.appendChild(tooltip);
      }

      // Position the tooltip to overlap with the concordance line
      const rect = div.getBoundingClientRect();
      tooltip.style.left = `${rect.left}px`; // Align with the left of the concordance
      tooltip.style.top = `${rect.bottom + 5}px`; // Place slightly below the concordance
    });

    div.addEventListener("mouseout", () => {
      const tooltip = document.getElementById("metadata-tooltip");
      if (tooltip) {
        tooltip.remove();
      }
    });

    resultsDiv.appendChild(div);
    matchCount++;
  });

  statusDiv.textContent = `Found ${matchCount} matches for your query.`;
}

// Add event listeners
searchBtn.addEventListener("click", performSearch);
queryInput.addEventListener("keypress", function(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    performSearch();
  }
});