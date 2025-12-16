// js/decrees.js
// Reads DecreeData.txt and renders decree cards with conditions + enact effects.

document.addEventListener("DOMContentLoaded", () => {
  initDecreesPage().catch(err => console.error("Decrees init error:", err));
});

async function initDecreesPage() {
  const searchInput = document.getElementById("decreeSearchInput");
  const gameSelect = document.getElementById("decreeGameFilter");
  const countInfo = document.getElementById("decreeCountInfo");
  const listEl = document.getElementById("decreeList");

  if (!searchInput || !listEl) {
    console.warn("[Decrees] Required DOM elements not found; aborting.");
    return;
  }

  const raw = await DataLoader.loadText("../data/DecreeData.txt");
  const json = JSON.parse(raw);
  const allDecrees = (json.items || []).map(mapDecreeRecord);

  let filtered = allDecrees.slice();

  function applyFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const gameFilter = gameSelect ? gameSelect.value : "";

    filtered = allDecrees.filter(dec => {
      if (gameFilter && dec.gameKey !== gameFilter) return false;
      if (!q) return true;
      return dec.searchText.includes(q);
    });

    render();
  }

  function render() {
    listEl.innerHTML = "";

    if (!filtered.length) {
      listEl.innerHTML = `<p class="empty-state">No decrees match current filters.</p>`;
      if (countInfo) countInfo.textContent = `Showing 0 of ${allDecrees.length} decrees`;
      return;
    }

    // Group decrees by turn (or Conditional)
    const groups = new Map();
    for (const dec of filtered) {
      const key = dec.availableTurn != null ? `Turn ${dec.availableTurn}` : "Conditional / No Fixed Turn";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(dec);
    }
    // Sort groups: Turn 1..N, then Conditional last
    const orderedGroups = [...groups.entries()].sort((a, b) => {
      const aKey = a[0], bKey = b[0];
      const aIsCond = aKey.startsWith("Conditional");
      const bIsCond = bKey.startsWith("Conditional");
      if (aIsCond && !bIsCond) return 1;
      if (!aIsCond && bIsCond) return -1;
      if (aIsCond && bIsCond) return 0;
      const aTurn = parseInt(aKey.replace("Turn ", ""), 10);
      const bTurn = parseInt(bKey.replace("Turn ", ""), 10);
      return aTurn - bTurn;
    });
    // Render each group as a collapsible panel
    for (const [groupName, items] of orderedGroups) {
      const panel = document.createElement("details");
      panel.className = "panel";
      panel.open = false;
      const summary = document.createElement("summary");
      summary.className = "panel-title";
      summary.textContent = `${groupName} (${items.length})`;
      panel.appendChild(summary);
      const panelBody = document.createElement("div");
      panelBody.className = "cards-container";
      panel.appendChild(panelBody);
      // Optional: sort within group (stable, readable)
      items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      for (const dec of items) {
        const card = document.createElement("article");
        card.className = "card";
        const turnLabel = dec.availableTurn != null ? `Turn ${dec.availableTurn}` : "Conditional / No Fixed Turn";
        card.innerHTML = `
          <header class="card-header">
            <h3 class="card-title">${escapeHtml(dec.title || dec.nameInDb)}</h3>
            <div class="card-meta">
              <span>${escapeHtml(turnLabel)}</span>
              <span>${escapeHtml(dec.gameLabel)}</span>
              <span class="mono">${escapeHtml(dec.nameInDb)}</span>
            </div>
          </header>
          <div class="card-body">
            <div class="card-col">
              <div class="pill pill-label">Enabled Condition</div>
              ${dec.enabledCondition ? `<p>${escapeHtml(dec.enabledCondition)}</p>` : `<p class="muted">No condition.</p>`}
              <div class="pill pill-label mt-small">Category</div>
              <p>${escapeHtml(dec.category || "None")}</p>
              <div class="pill pill-label mt-small">Error Conditions</div>
              ${dec.errorConditions.length ? `<ul class="pill-list">${dec.errorConditions.map(e => `<li>${escapeHtml(e.condition)}: ${escapeHtml(e.message)}</li>`).join("")}</ul>` : `<p class="muted">No errors.</p>`}
            </div>
            <div class="card-col">
              <div class="pill pill-label">Effects on Enact</div>
              ${dec.effects.length ? `<ul class="pill-list">${dec.effects.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : `<p class="muted">No effects.</p>`}
            </div>
          </div>
        `;
        panelBody.appendChild(card);
      }
      listEl.appendChild(panel);
    }

    if (countInfo) {
      countInfo.textContent = `Showing ${filtered.length} of ${allDecrees.length} decrees`;
    }
  }

  searchInput.addEventListener("input", applyFilters);
  if (gameSelect) gameSelect.addEventListener("change", applyFilters);

  applyFilters();
}

function getDecreeTurn(decree) {
  // 1) Explicit field
  if (typeof decree.AvailableAtTurn === "number" && decree.AvailableAtTurn > 0) {
    return decree.AvailableAtTurn;
  }

  // 2) Infer from ID like Turn07_Decree_...
  if (decree.DecreeId) {
    const match = decree.DecreeId.match(/Turn(\d{1,2})_/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null; // Conditional / unknown
}


function mapDecreeRecord(raw) {
  const nameInDb = raw.NameInDatabase || "";
  const decProps = raw.DecreeProperties || {};
  const title = decProps.Title || nameInDb;
  const path = raw.Path || "";

  let gameKey = "Base";
  if (path.startsWith("Rizia/")) gameKey = "RiziaDLC";
  else if (path.startsWith("Sordland/")) gameKey = "Base";

  const gameLabel = gameKey === "RiziaDLC" ? "Rizia DLC" : "Base Game";

const availableTurn = (() => {
  // A) Explicit (if it exists in your data)
  if (typeof decProps.AvailableAtTurn === "number" && decProps.AvailableAtTurn >= 0) {
    return decProps.AvailableAtTurn;
  }

  // B) Hidden until turn (what you already used)
  if (typeof decProps.HiddenUntilTurnNo === "number" && decProps.HiddenUntilTurnNo >= 0) {
    return decProps.HiddenUntilTurnNo;
  }

  // C) Infer from internal ID (common pattern: Turn07_...)
  const fromId = (nameInDb || "").match(/Turn(\d{1,2})_/i);
  if (fromId) return parseInt(fromId[1], 10);

  return null; // conditional / unknown
})();

  const enabledCondition = decProps.IsEnabled || "";
  const category = decProps.DecreeCategoryString || "";

  const errorConditions = (decProps.ErrorValidationDatas || []).map(e => ({
    condition: e.ErrorCondition || "",
    message: e.ErrorMessage || ""
  }));

  const effects = splitScript(decProps.OnDecreeEnact);

  const searchText = [
    nameInDb,
    title,
    path,
    gameLabel,
    category,
    enabledCondition,
    String(availableTurn ?? ""),
    errorConditions.map(e => `${e.condition} ${e.message}`).join(" "),
    effects.join(" ")
  ]
    .join(" || ")
    .toLowerCase();

  return {
    nameInDb,
    title,
    path,
    gameKey,
    gameLabel,
    availableTurn,
    enabledCondition,
    category,
    errorConditions,
    effects,
    searchText
  };
}

function splitScript(script) {
  if (!script) return [];
  return script
    .split(";")
    .map(s => s.replace(/\r?\n/g, " ").trim())
    .filter(Boolean);
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch] || ch));
}
