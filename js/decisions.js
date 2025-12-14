// js/decisions.js
// Reads DecisionData.txt and renders decision cards with options, conditions, and effects.

document.addEventListener("DOMContentLoaded", () => {
  initDecisionsPage().catch(err => console.error("Decisions init error:", err));
});

async function initDecisionsPage() {
  const searchInput = document.getElementById("decisionSearchInput");
  const gameSelect = document.getElementById("decisionGameFilter");
  const countInfo = document.getElementById("decisionCountInfo");
  const summaryCount = document.getElementById("decisionSummaryCount");
  const listEl = document.getElementById("decisionList");

  if (!searchInput || !listEl) {
    console.warn("[Decisions] Required DOM elements not found; aborting.");
    return;
  }

  const raw = await DataLoader.loadText("../data/DecisionData.txt");
  const json = JSON.parse(raw);
  const allDecisions = (json.items || []).map(mapDecisionRecord);

  let filtered = allDecisions.slice();

  function applyFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const gameFilter = gameSelect ? gameSelect.value : "";

    filtered = allDecisions.filter(dec => {
      if (gameFilter && dec.gameKey !== gameFilter) return false;
      if (!q) return true;
      return dec.searchText.includes(q);
    });

    render();
  }

  function render() {
    listEl.innerHTML = "";

    if (!filtered.length) {
      listEl.innerHTML = `<p class="empty-state">No decisions match current filters.</p>`;
      if (countInfo) countInfo.textContent = `Showing 0 of ${allDecisions.length} decisions`;
      if (summaryCount) summaryCount.textContent = "0";
      return;
    }

    for (const dec of filtered) {
      const card = document.createElement("article");
      card.className = "card";

      const turnLabel = dec.turn ? `Turn ${dec.turn}` : "Turn: ?";

      const optionsHtml = dec.options
        .map(opt => {
          const condHtml = opt.condition
            ? `<p class="muted small">Condition: ${escapeHtml(opt.condition)}</p>`
            : `<p class="muted small">No special condition (always shown).</p>`;

          const effectsHtml = opt.effects.length
            ? `<ul class="pill-list">
                 ${opt.effects.map(e => `<li>${escapeHtml(e)}</li>`).join("")}
               </ul>`
            : `<p class="muted small">No explicit mechanical effect.</p>`;

          return `
            <div class="decision-option">
              <div class="pill pill-label">${escapeHtml(opt.text || "(no label)")}</div>
              ${condHtml}
              ${effectsHtml}
            </div>
          `;
        })
        .join("");

      const conditionsHtml = dec.conditions.length
        ? `<ul class="pill-list">
             ${dec.conditions.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
           </ul>`
        : `<p class="muted">No explicit decision-level condition.</p>`;

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
            <div class="pill pill-label">Decision conditions</div>
            ${conditionsHtml}
          </div>

          <div class="card-col">
            <div class="pill pill-label">Options & effects</div>
            ${optionsHtml}
          </div>
        </div>
      `;

      listEl.appendChild(card);
    }

    if (countInfo) {
      countInfo.textContent = `Showing ${filtered.length} of ${allDecisions.length} decisions`;
    }
    if (summaryCount) {
      summaryCount.textContent = String(filtered.length);
    }
  }

  searchInput.addEventListener("input", applyFilters);
  if (gameSelect) gameSelect.addEventListener("change", applyFilters);

  applyFilters();
}

function mapDecisionRecord(raw) {
  const nameInDb = raw.NameInDatabase || "";
  const decProps = raw.DecisionProperties || {};
  const fragProps = raw.StoryFragmentProperties || {};
  const title = decProps.Title || nameInDb;
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

  const options = (decProps.Options || []).map(opt => {
    const condition = opt.Condition || "";
    const text = opt.Text || "";
    const effects = splitScript(opt.Instruction);

    return { condition, text, effects };
  });

  const searchText = [
    nameInDb,
    title,
    path,
    conditions.join(" "),
    options.map(o => `${o.text} ${o.condition} ${o.effects.join(" ")}`).join(" ")
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
    options,
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
