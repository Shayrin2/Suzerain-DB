// js/bills.js
// Loads bills from the consolidated Entity Text Asset and renders them with filters and export.

document.addEventListener("DOMContentLoaded", () => {
  initBillsPage().catch(err => console.error("Bills init error:", err));
});

async function initBillsPage() {
  const searchInput = document.getElementById("billSearchInput");
  const gameSelect = document.getElementById("billGameFilter");
  const turnSelect = document.getElementById("billTurnFilter");
  const countInfo = document.getElementById("billCountInfo");
  const listEl = document.getElementById("billList");
  const exportBtn = document.getElementById("billExportBtn");
  const exportMenu = document.getElementById("billExportMenu");
  const exportConfirm = document.getElementById("billExportConfirm");
  const exportCancel = document.getElementById("billExportCancel");
  const exportConditions = document.getElementById("billExportConditions");
  const exportSign = document.getElementById("billExportSign");
  const exportVeto = document.getElementById("billExportVeto");
  const exportMeta = document.getElementById("billExportMeta");

  if (!searchInput || !listEl) {
    console.warn("[Bills] Required DOM elements not found; aborting.");
    return;
  }

  const allBills = await loadBillsFromEntityAsset();
  let filtered = allBills.slice();

  function applyFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const gameFilter = gameSelect ? gameSelect.value : "";
    const turnFilter = turnSelect ? turnSelect.value : "";

    filtered = allBills.filter(bill => {
      if (gameFilter && bill.gameKey !== gameFilter) return false;
      if (turnFilter && String(bill.turn || "") !== turnFilter) return false;
      if (!q) return true;
      return bill.searchText.includes(q);
    });

    // sort by turn asc, unknowns last, then title
    filtered.sort((a, b) => {
      const ta = a.turn ?? 999;
      const tb = b.turn ?? 999;
      if (ta !== tb) return ta - tb;
      return (a.title || a.nameInDb || "").localeCompare(b.title || b.nameInDb || "");
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

      const conditionsHtml = bill.conditions.length
        ? `<ul class="pill-list">
            ${bill.conditions.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
           </ul>`
        : `<p class="muted">No explicit condition (always available once the story reaches this point).</p>`;

      const signHtml = bill.signEffects.length
        ? `<ul class="pill-list">
            ${bill.signEffects.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
           </ul>`
        : `<p class="muted small">No explicit sign effects.</p>`;

      const vetoHtml = bill.vetoEffects.length
        ? `<ul class="pill-list">
            ${bill.vetoEffects.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
           </ul>`
        : `<p class="muted small">No explicit veto effects.</p>`;

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
          ${bill.description ? `<p class="card-description muted">${escapeHtml(bill.description)}</p>` : ""}
          <div class="card-col">
            ${conditionsHtml}
          </div>
          <div class="card-col">
            <div class="pill pill-label">Sign effects</div>
            ${signHtml}
          </div>
          <div class="card-col">
            <div class="pill pill-label">Veto effects</div>
            ${vetoHtml}
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
  if (turnSelect) turnSelect.addEventListener("change", applyFilters);

  applyFilters();

  function toggleExport(show) {
    if (!exportMenu) return;
    exportMenu.hidden = !show;
  }

  function buildExportText() {
    const include = {
      cond: exportConditions?.checked !== false,
      sign: exportSign?.checked !== false,
      veto: exportVeto?.checked !== false,
      meta: exportMeta?.checked !== false,
    };
    const lines = [];
    lines.push(`Bills export (${filtered.length} items)`);
    lines.push("");
    filtered.forEach(bill => {
      const row = [`- ${bill.title || bill.nameInDb}`];
      if (include.meta) {
        const meta = [];
        if (bill.turn) meta.push(`Turn ${bill.turn}`);
        if (bill.gameLabel) meta.push(bill.gameLabel);
        if (bill.path) meta.push(bill.path);
        if (meta.length) row.push(`(${meta.join(" | ")})`);
      }
      lines.push(row.join(" "));
      if (include.cond && bill.conditions.length) {
        lines.push(`  Conditions: ${bill.conditions.join(" | ")}`);
      }
      if (include.sign && bill.signEffects.length) {
        lines.push(`  Sign effects: ${bill.signEffects.join(" | ")}`);
      }
      if (include.veto && bill.vetoEffects.length) {
        lines.push(`  Veto effects: ${bill.vetoEffects.join(" | ")}`);
      }
      lines.push("");
    });
    return lines.join("\n");
  }

  function downloadExport() {
    const content = buildExportText();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bills_export.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toggleExport(false);
  }

  if (exportBtn) exportBtn.addEventListener("click", () => toggleExport(exportMenu?.hidden));
  if (exportCancel) exportCancel.addEventListener("click", () => toggleExport(false));
  if (exportConfirm) exportConfirm.addEventListener("click", downloadExport);
  document.addEventListener("click", e => {
    if (!exportMenu || exportMenu.hidden) return;
    const t = e.target;
    if (t === exportMenu || t === exportBtn || exportMenu.contains(t) || exportBtn.contains(t)) return;
    toggleExport(false);
  });
}

async function loadBillsFromEntityAsset() {
  try {
    const raw = await DataLoader.loadText("../data/Entity%20Text%20Asset.txt");
    const parsed = parseItemsFromText(raw);
    if (parsed && parsed.items) {
      const bills = (parsed.items || []).filter(item => /\/Bills/i.test(item.Path || ""));
      return bills.map(mapBillRecord);
    }
    console.warn("[Bills] Entity Text Asset did not contain Bills data.");
    return [];
  } catch (e) {
    console.warn("[Bills] Failed to load or parse Entity Text Asset:", e);
    return [];
  }
}

function parseItemsFromText(raw) {
  if (!raw) return null;

  // If it's already JSON, try direct parse.
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }

  // Extract the items array from within the text asset.
  const itemsIdx = raw.indexOf('"items"');
  if (itemsIdx === -1) return null;
  const arrayStart = raw.indexOf("[", itemsIdx);
  if (arrayStart === -1) return null;

  let depth = 0;
  let arrayEnd = -1;
  for (let i = arrayStart; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i;
        break;
      }
    }
  }
  if (arrayEnd === -1) return null;

  const jsonStr = `{ "items": ${raw.slice(arrayStart, arrayEnd + 1)} }`;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function mapBillRecord(raw) {
  const nameInDb = raw.NameInDatabase || "";
  const billProps = raw.BillProperties || {};
  const fragProps = raw.StoryFragmentProperties || {};
  const title = billProps.Title || nameInDb;
  const description = billProps.Description || "";
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

  const signEffects = splitScript(billProps.SignVariables || billProps.SignInstruction);
  const vetoEffects = splitScript(billProps.VetoVariables || billProps.VetoInstruction);

  const searchText = [
    nameInDb,
    title,
    path,
    conditions.join(" "),
    signEffects.join(" "),
    vetoEffects.join(" "),
  ]
    .join(" || ")
    .toLowerCase();

  return {
    nameInDb,
    title,
    description,
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
