// This will store our extracted ID values
let dhlabidsArray = [];
const statusDiv = document.getElementById("status");
const searchBtn = document.getElementById("searchBtn");
const queryInput = document.getElementById("query");

// Add a timestamp to prevent caching for dynamic resources
const timestamp = new Date().getTime();
const jsonUrl = `corpus.json?v=${timestamp}`;

statusDiv.textContent = "Loading corpus data...";

// Load the corpus data when the page loads
fetch(jsonUrl)
  .then(res => res.json())
  .then(data => {
    if (data && data.dhlabids) {
      if (Array.isArray(data.dhlabids)) {
        dhlabidsArray = data.dhlabids;
        statusDiv.textContent = `Loaded corpus with ${dhlabidsArray.length} documents (array format)`;
      } else if (typeof data.dhlabids === "object") {
        dhlabidsArray = Object.values(data.dhlabids);
        statusDiv.textContent = `Loaded corpus with ${dhlabidsArray.length} documents (object format)`;
      } else {
        statusDiv.textContent = "Error: dhlabids has unexpected format";
        console.error("Unexpected dhlabids format:", typeof data.dhlabids);
      }
    } else {
      statusDiv.textContent = "Error: No dhlabids found in JSON";
      console.error("No dhlabids in data:", data);
    }
  })
  .catch(err => {
    statusDiv.textContent = `Error loading corpus: ${err.message}`;
    console.error("Failed to load corpus data:", err);
  });

// Search function
async function performSearch() {
  try {
    const query = queryInput.value;

    if (!query) {
      alert("Please enter a search term");
      return;
    }

    if (!dhlabidsArray || dhlabidsArray.length === 0) {
      alert("Corpus data not loaded yet. Please try again.");
      return;
    }

    const resultsDiv = document.getElementById("results");
    statusDiv.textContent = "Searching...";
    resultsDiv.innerHTML = "";

    const idsToUse = [...dhlabidsArray].slice(0, 20000);

    const concBody = {
      dhlabids: idsToUse,
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
      throw new Error(`HTTP error ${concResp.status}`);
    }

    const conc = await concResp.json();

    statusDiv.textContent = `Found results for "${query}"`;

    if (!conc.conc || Object.keys(conc.conc).length === 0) {
      resultsDiv.innerHTML = "<p>No results found for this query.</p>";
      return;
    }

    let matchCount = 0;

    Object.keys(conc.conc).forEach(key => {
      let text = conc.conc[key];
      const urn = conc.urn[key];
      const searchText = (text.match(/<b>(.*?)<\/b>/) || [])[1] || "";
      const urnLink = `https://www.nb.no/items/${urn}?searchText=${encodeURIComponent(searchText)}`;

      if (searchText) {
        text = text.replace(
          `<b>${searchText}</b>`,
          `<a href="${urnLink}" target="_blank" class="text-decoration-underline"><b>${searchText}</b></a>`
        );
      }

      const div = document.createElement("div");
      div.className = "concordance";
      div.setAttribute("data-urn", urn);
      div.innerHTML = `<p>${text}</p>`;
      resultsDiv.appendChild(div);
      matchCount++;
    });

    statusDiv.textContent = `Found ${matchCount} matches for "${query}"`;

    // Add hover functionality
    addHoverFunctionality();
  } catch (error) {
    statusDiv.textContent = `Error: ${error.message}`;
    document.getElementById("results").innerHTML = `<p class="error">Search failed: ${error.message}</p>`;
    console.error("Search failed:", error);
  }
}

// Add hover functionality
function addHoverFunctionality() {
  const concordances = document.querySelectorAll(".concordance");

  concordances.forEach(concordance => {
    concordance.addEventListener("mouseover", event => {
      const urn = concordance.getAttribute("data-urn");
      const urnLink = `https://www.nb.no/items/${urn}`;

      const tooltip = document.createElement("div");
      tooltip.id = "metadata-tooltip";
      tooltip.className = "tooltip";
      tooltip.innerHTML = `
        <a href="${urnLink}" target="_blank" class="btn btn-link p-0">View Document</a>
      `;

      document.body.appendChild(tooltip);

      tooltip.style.left = `${event.pageX + 10}px`;
      tooltip.style.top = `${event.pageY + 10}px`;
    });

    concordance.addEventListener("mouseout", () => {
      const tooltip = document.getElementById("metadata-tooltip");
      if (tooltip) {
        tooltip.remove();
      }
    });
  });
}

// Add event listeners
searchBtn.addEventListener("click", performSearch);
queryInput.addEventListener("keypress", function(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    performSearch();
  }
});