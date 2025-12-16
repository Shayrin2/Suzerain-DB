// js/bills.js
// Reads BillData.txt and renders mechanical bill cards (conditions + sign/veto effects).

document.addEventListener("DOMContentLoaded", () => {
  initBillsPage().catch(err => console.error("Bills init error:", err));
});

async function initBillsPage() {
  const searchInput = document.getElementById("billSearchInput");
  const gameSelect = document.getElementById("billGameFilter");
  const countInfo = document.getElementById("billCountInfo");
  const listEl = document.getElementById("billList");

  if (!searchInput || !listEl) {
    console.warn("[Bills] Required DOM elements not found; aborting.");
    return;
  }

  const raw = await DataLoader.loadText("../data/BillData.txt");
  const json = JSON.parse(raw);
  const allBills = (json.items || []).map(mapBillRecord);

  let filtered = allBills.slice();

  function applyFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const gameFilter = gameSelect ? gameSelect.value : "";

    filtered = allBills.filter(bill => {
      if (gameFilter && bill.gameKey !== gameFilter) return false;
      if (!q) return true;
      return bill.searchText.includes(q);
    });

    render();
  }

  function render() {
    listEl.innerHTML = "";

    if (!filtered.length) {
      listEl.innerHTML = `<p class="empty-state">No bills match current filters.</p>`;
      if (countInfo) countInfo.textContent = `Showing 0 of ${allBills.length} bills`;
      return;
    }

    for (const bill of filtered) {
      const card = document.createElement("article");
      card.className = "card";

      const turnLabel = bill.turn ? `Turn ${bill.turn}` : "Turn: ?";

      card.innerHTML = `
        <header class="card-header">
          <h3 class="card-title">${escapeHtml(bill.title || bill.nameInDb)}</h3>
          <div class="card-meta">
            <span>${escapeHtml(turnLabel)}</span>
            <span>${escapeHtml(bill.gameLabel)}</span>
            <span class="mono">${escapeHtml(bill.nameInDb)}</span>
          </div>
        </header>
        <div class="card-body">
          <div class="card-col">
            <div class="pill pill-label">Conditions</div>
            ${
              bill.conditions.length
                ? `<ul class="pill-list">
                    ${bill.conditions.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
                   </ul>`
                : `<p class="muted">No explicit condition (always available once the story reaches this point).</p>`
            }
          </div>

          <div class="card-col">
            <div class="pill pill-label">Effects if SIGNED</div>
            ${
              bill.signEffects.length
                ? `<ul class="pill-list">
                    ${bill.signEffects.map(e => `<li>${escapeHtml(e)}</li>`).join("")}
                   </ul>`
                : `<p class="muted">No explicit variables set on sign.</p>`
            }

            <div class="pill pill-label mt-small">Effects if VETOED</div>
            ${
              bill.vetoEffects.length
                ? `<ul class="pill-list">
                    ${bill.vetoEffects.map(e => `<li>${escapeHtml(e)}</li>`).join("")}
                   </ul>`
                : `<p class="muted">No explicit variables set on veto.</p>`
            }
          </div>
        </div>
      `;

      listEl.appendChild(card);
    }

    if (countInfo) {
      countInfo.textContent = `Showing ${filtered.length} of ${allBills.length} bills`;
    }
  }

  searchInput.addEventListener("input", applyFilters);
  if (gameSelect) gameSelect.addEventListener("change", applyFilters);

  applyFilters();
}

function mapBillRecord(raw) {
  const nameInDb = raw.NameInDatabase || "";
  const billProps = raw.BillProperties || {};
  const fragProps = raw.StoryFragmentProperties || {};
  const title = billProps.Title || nameInDb;
  const path = raw.Path || "";

  let gameKey = "Base";
  if (path.startsWith("Rizia/")) gameKey = "RiziaDLC";
  else if (path.startsWith("Sordland/")) gameKey = "Base";

  const gameLabel = gameKey === "RiziaDLC" ? "Rizia DLC" : "Base Game";

  const turnMatch = nameInDb.match(/Turn(\d+)_/i);
  const turn = turnMatch ? parseInt(turnMatch[1], 10) : null;

  const conditions = [];
  if (fragProps.StoryFragmentCondition) {
    conditions.push(fragProps.StoryFragmentCondition);
  }
  if (billProps.IsVetoDisabledCondition) {
    conditions.push(`Veto disabled when: ${billProps.IsVetoDisabledCondition}`);
  }

  const signEffects = splitScript(billProps.SignVariables);
  const vetoEffects = splitScript(billProps.VetoVariables);

  const searchText = [
    nameInDb,
    title,
    path,
    conditions.join(" "),
    signEffects.join(" "),
    vetoEffects.join(" ")
  ]
    .join(" || ")
    .toLowerCase();

  return {
    nameInDb,
    title,
    path,
    gameKey,
    gameLabel,
    turn,
    conditions,
    signEffects,
    vetoEffects,
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
