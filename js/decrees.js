// js/decrees.js
// Reads DecreeData.txt and renders decree cards with conditions + enact effects.

document.addEventListener("DOMContentLoaded", () => {
  initDecreesPage().catch(err => console.error("Decrees init error:", err));
});

async function initDecreesPage() {
  const searchInput = document.getElementById("decreeSearchInput");
  const gameSelect = document.getElementById("decreeGameFilter");
  const countInfo = document.getElementById("decreeCountInfo");
  const summaryCount = document.getElementById("decreeSummaryCount");
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
      if (summaryCount) summaryCount.textContent = "0";
      return;
    }

    for (const dec of filtered) {
      const card = document.createElement("article");
      card.className = "card";

      const turnLabel = dec.availableTurn != null
        ? `Available from Turn ${dec.availableTurn}`
        : "Available logic: see conditions";

      const categoryLabel = dec.category || "Uncategorized";

      const enabledHtml = dec.enabledCondition
        ? `<li>Enabled when: ${escapeHtml(dec.enabledCondition)}</li>`
        : "";

      const hiddenHtml = dec.availableTurn != null
        ? `<li>Appears from Turn ${escapeHtml(String(dec.availableTurn))}</li>`
        : "";

      const errorHtml = dec.errorConditions.length
        ? dec.errorConditions
            .map(e => `<li>Blocked if: ${escapeHtml(e.condition)}${e.message ? ` → ${escapeHtml(e.message)}` : ""}</li>`)
            .join("")
        : "";

      const conditionsBlock = (enabledHtml || hiddenHtml || errorHtml)
        ? `<ul class="pill-list">
             ${hiddenHtml}${enabledHtml}${errorHtml}
           </ul>`
        : `<p class="muted">No explicit condition data (purely manual trigger or story-driven).</p>`;

      const effectsHtml = dec.effects.length
        ? `<ul class="pill-list">
             ${dec.effects.map(e => `<li>${escapeHtml(e)}</li>`).join("")}
           </ul>`
        : `<p class="muted">No explicit mechanical effect (OnDecreeEnact empty).</p>`;

      card.innerHTML = `
        <header class="card-header">
          <h3 class="card-title">${escapeHtml(dec.title || dec.nameInDb)}</h3>
          <div class="card-meta">
            <span>${escapeHtml(dec.gameLabel)}</span>
            <span>${escapeHtml(categoryLabel)}</span>
            <span>${escapeHtml(turnLabel)}</span>
            <span class="mono">${escapeHtml(dec.nameInDb)}</span>
          </div>
        </header>

        <div class="card-body">
          <div class="card-col">
            <div class="pill pill-label">Conditions / availability</div>
            ${conditionsBlock}
          </div>
          <div class="card-col">
            <div class="pill pill-label">Effects on enact</div>
            ${effectsHtml}
          </div>
        </div>
      `;

      listEl.appendChild(card);
    }

    if (countInfo) {
      countInfo.textContent = `Showing ${filtered.length} of ${allDecrees.length} decrees`;
    }
    if (summaryCount) {
      summaryCount.textContent = String(filtered.length);
    }
  }

  searchInput.addEventListener("input", applyFilters);
  if (gameSelect) gameSelect.addEventListener("change", applyFilters);

  applyFilters();
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

  const availableTurn =
    typeof decProps.HiddenUntilTurnNo === "number" && decProps.HiddenUntilTurnNo >= 0
      ? decProps.HiddenUntilTurnNo
      : null;

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
