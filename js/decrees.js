// js/decrees.js
// Loads decrees from the consolidated Entity Text Asset and renders with filters/export.

document.addEventListener("DOMContentLoaded", () => {
  initDecreesPage().catch(err => console.error("Decrees init error:", err));
});

async function initDecreesPage() {
  const searchInput = document.getElementById("decreeSearchInput");
  const gameSelect = document.getElementById("decreeGameFilter");
  const turnSelect = document.getElementById("decreeTurnFilter");
  const categorySelect = document.getElementById("decreeCategoryFilter");
  const groupingSelect = document.getElementById("decreeGroupingFilter");
  const countInfo = document.getElementById("decreeCountInfo");
  const listEl = document.getElementById("decreeList");
  const exportBtn = document.getElementById("decreeExportBtn");
  const exportMenu = document.getElementById("decreeExportMenu");
  const exportConfirm = document.getElementById("decreeExportConfirm");
  const exportCancel = document.getElementById("decreeExportCancel");
  const exportConditions = document.getElementById("decreeExportConditions");
  const exportEffects = document.getElementById("decreeExportEffects");
  const exportMeta = document.getElementById("decreeExportMeta");

  if (!searchInput || !listEl) {
    console.warn("[Decrees] Required DOM elements not found; aborting.");
    return;
  }

  const allDecrees = await loadDecreesFromEntityAsset();
  let filtered = allDecrees.slice();

  function applyFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const gameFilter = gameSelect ? gameSelect.value : "";
    const turnFilter = turnSelect ? turnSelect.value : "";
    const categoryFilter = categorySelect ? categorySelect.value : "";
    const grouping = groupingSelect ? groupingSelect.value : "Turn";

    filtered = allDecrees.filter(dec => {
      if (gameFilter && dec.gameKey !== gameFilter) return false;
      if (turnFilter) {
        const turnVal = dec.availableTurn != null ? String(dec.availableTurn) : "";
        if (turnVal !== turnFilter) return false;
      }
      if (categoryFilter && (dec.category || "") !== categoryFilter) return false;
      if (!q) return true;
      return dec.searchText.includes(q);
    });

    render(grouping);
  }

  function render(groupingMode = "Turn") {
    listEl.innerHTML = "";

    if (!filtered.length) {
      listEl.innerHTML = `<p class="empty-state">No decrees match current filters.</p>`;
      if (countInfo) countInfo.textContent = `Showing 0 of ${allDecrees.length} decrees`;
      return;
    }

    // Group decrees by turn or category
    const groups = new Map();
      for (const dec of filtered) {
        let key;
        if (groupingMode === "Category") {
          key = dec.category || "Other";
        } else {
          key = dec.availableTurn != null ? `Turn ${dec.availableTurn}` : "Conditional / No Fixed Turn";
        }
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(dec);
      }

      const orderedGroups = [...groups.entries()].sort((a, b) => {
        if (groupingMode === "Category") {
          const aKey = a[0] === "None" ? "Other" : a[0];
          const bKey = b[0] === "None" ? "Other" : b[0];
          return aKey.localeCompare(bKey);
        }
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

      for (const [groupName, items] of orderedGroups) {
        const displayName =
          groupingMode === "Category" && groupName === "None" ? "Other" : groupName;
        const panel = document.createElement("details");
        panel.className = "panel";
        panel.open = false;
        const summary = document.createElement("summary");
        summary.className = "panel-title";
        summary.textContent = `${displayName} (${items.length})`;
      panel.appendChild(summary);
      const panelBody = document.createElement("div");
      panelBody.className = "cards-container";
      panel.appendChild(panelBody);

      items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      for (const dec of items) {
        const card = document.createElement("article");
        card.className = "card";
        const turnLabel = dec.availableTurn != null ? `Turn ${dec.availableTurn}` : "Conditional / No Fixed Turn";
        const availLabel = dec.availableTurn != null
          ? `Turn ${dec.availableTurn}${dec.availableStep != null ? `, Step ${dec.availableStep}` : ""}`
          : "No fixed turn (event/conditional)";

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
            ${(dec.hiddenUntilTurn != null || dec.hiddenUntilStep != null) ? `
              <div class="pill pill-label">Hidden until</div>
              <p class="muted">Turn ${dec.hiddenUntilTurn ?? "?"}${dec.hiddenUntilStep != null ? `, after Step ${dec.hiddenUntilStep}` : ""} (available at ${availLabel})</p>
            ` : ""}
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
  if (turnSelect) turnSelect.addEventListener("change", applyFilters);
  if (categorySelect) categorySelect.addEventListener("change", applyFilters);
  if (groupingSelect) groupingSelect.addEventListener("change", applyFilters);

  applyFilters();

  function toggleExport(show) {
    if (!exportMenu) return;
    exportMenu.hidden = !show;
  }

  function buildExportText() {
    const include = {
      cond: exportConditions?.checked !== false,
      eff: exportEffects?.checked !== false,
      meta: exportMeta?.checked !== false,
    };
    const lines = [];
    lines.push(`Decrees export (${filtered.length} items)`);
    lines.push("");
    filtered.forEach(dec => {
      const row = [`- ${dec.title || dec.nameInDb}`];
      if (include.meta) {
        const meta = [];
        if (dec.availableTurn != null) meta.push(`Turn ${dec.availableTurn}`);
        if (dec.category) meta.push(dec.category);
        if (dec.path) meta.push(dec.path);
        if (dec.gameLabel) meta.push(dec.gameLabel);
        if (meta.length) row.push(`(${meta.join(" | ")})`);
      }
      lines.push(row.join(" "));
      if (include.cond && dec.enabledCondition) {
        lines.push(`  Condition: ${dec.enabledCondition}`);
      }
      if (include.cond && dec.errorConditions.length) {
        lines.push(`  Error conditions: ${dec.errorConditions.map(e => `${e.condition}: ${e.message}`).join(" | ")}`);
      }
      if (include.eff && dec.effects.length) {
        lines.push(`  Effects: ${dec.effects.join(" | ")}`);
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
    a.download = "decrees_export.txt";
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

async function loadDecreesFromEntityAsset() {
  // Try encoded path first, then unencoded as a fallback in case the server
  // doesn’t like %20 in the URL.
  const paths = ["../data/Entity Text Asset.txt", "../data/Entity Text Asset.txt"];
  for (const p of paths) {
    try {
      const raw = await DataLoader.loadText(p);
      const parsed = parseItemsFromText(raw);
      if (parsed && parsed.items) {
        const items = (parsed.items || []).filter(item => {
          const path = (item.Path || "").toLowerCase();
          return path.includes("decrees");
        });
        if (items.length) return items.map(item => mapDecreeRecord(item, parsed.stepCounts));
      }
    } catch (e) {
      console.warn(`[Decrees] Failed to load or parse Entity Text Asset at ${p}:`, e);
    }
  }

  console.warn("[Decrees] Entity Text Asset did not contain Decrees data.");
  return [];
}

function parseItemsFromText(raw) {
  if (!raw) return null;

  // Precompute blocks and step counts (if present)
  const blocks = extractDataBlocks(raw);
  const stepCounts = buildStepCounts(blocks);

  // Prefer the explicit DecreesDataJson block if present.
  const explicit = raw.match(/string\s+DecreesDataJson\s*=\s*\"([\s\S]*?)\"/);
  if (explicit) {
    try {
      const parsed = JSON.parse(explicit[1]);
      return { items: parsed.items || [], stepCounts };
    } catch {
      // fall through to other parsing paths
    }
  }

  // If we have named blocks, try DecreesDataJson first.
  if (blocks && blocks.Decrees) {
    try {
      const parsed = JSON.parse(blocks.Decrees);
      return { items: parsed.items || [], stepCounts };
    } catch {
      // fall through
    }
  }

  // Direct JSON?
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      return { items: parsed.items || [], stepCounts };
    } catch {
      // ignore
    }
  }

  // Extract first items array.
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
    return { items: JSON.parse(jsonStr).items || [], stepCounts };
  } catch {
    return null;
  }
}

function extractDataBlocks(text) {
  if (!text) return null;
  const regex = /string\s+(\w+)DataJson\s*=\s*"/g;
  const matches = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ name: m[1], start: m.index, end: m.index + m[0].length });
  }
  if (!matches.length) return null;
  const blocks = {};
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : text.length;
    const slice = text.substring(cur.end, nextStart);
    const trimmed = slice.lastIndexOf("\"") >= 0 ? slice.substring(0, slice.lastIndexOf("\"")) : slice;
    blocks[cur.name] = trimmed.trim();
  }
  return blocks;
}

function buildStepCounts(blocks) {
  // Returns counts per game key: { Base: {turn:count}, RiziaDLC: {turn:count} }
  const empty = {};
  if (!blocks || !blocks.Step) return empty;
  try {
    const data = JSON.parse(blocks.Step);
    const counts = {};
    for (const step of data.items || []) {
      const name = step.NameInDatabase || "";
      const m = name.match(/^(Rizia|Sordland)_Turn(\d+)_Step(\d+)/i);
      if (!m) continue;
      const root = m[1];
      const turn = parseInt(m[2], 10);
      const stepNo = parseInt(m[3], 10);
      const gameKey = root === "Rizia" ? "RiziaDLC" : "Base";
      if (!counts[gameKey]) counts[gameKey] = {};
      counts[gameKey][turn] = Math.max(counts[gameKey][turn] || 0, stepNo);
    }
    return counts;
  } catch {
    return empty;
  }
}

function mapDecreeRecord(raw, stepCounts = {}) {
  const nameInDb = raw.NameInDatabase || "";
  const decProps = raw.DecreeProperties || {};
  const title = decProps.Title || nameInDb;
  const path = raw.Path || "";

  let gameKey = "Base";
  if (path.startsWith("Rizia/")) gameKey = "RiziaDLC";
  else if (path.startsWith("Sordland/")) gameKey = "Base";

  const gameLabel = gameKey === "RiziaDLC" ? "Rizia DLC" : "Base Game";

  const hiddenTurnRaw = typeof decProps.HiddenUntilTurnNo === "number" ? decProps.HiddenUntilTurnNo : null;
  const hiddenStepRaw = typeof decProps.HiddenUntilStepNo === "number" ? decProps.HiddenUntilStepNo : null;
  const hiddenTurn = hiddenTurnRaw != null && hiddenTurnRaw >= 0 ? hiddenTurnRaw : null;
  const hiddenStep = hiddenStepRaw != null && hiddenStepRaw >= 0 ? hiddenStepRaw : null;

  const stepCountsForGame = stepCounts[gameKey] || {};

  const availability = (() => {
    // Explicit AvailableAtTurn overrides all
    if (typeof decProps.AvailableAtTurn === "number" && decProps.AvailableAtTurn >= 0) {
      return { turn: decProps.AvailableAtTurn, step: null };
    }
    // If we have hidden turn/step info, compute availability as the next step after the hidden one.
    if (hiddenTurn != null) {
      const stepsInTurn = stepCountsForGame[hiddenTurn] || 0;
      if (hiddenStep != null && stepsInTurn > 0) {
        // If hidden step is the last step, become available on next turn step 1
        if (hiddenStep >= stepsInTurn) {
          return { turn: hiddenTurn + 1, step: 1 };
        }
        return { turn: hiddenTurn, step: hiddenStep + 1 };
      }
      return { turn: hiddenTurn, step: null };
    }
    // Infer from ID pattern
    const fromId = (nameInDb || "").match(/Turn(\d{1,2})_/i);
    if (fromId) return { turn: parseInt(fromId[1], 10), step: null };
    return { turn: null, step: null };
  })();

  const enabledCondition = decProps.IsEnabled || "";
  const category = deriveCategory(path, decProps.DecreeCategoryString);

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
    String(availability.turn ?? ""),
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
    availableTurn: availability.turn,
    availableStep: availability.step,
    hiddenUntilTurn: hiddenTurn,
    hiddenUntilStep: hiddenStep,
    enabledCondition,
    category,
    errorConditions,
    effects,
    searchText
  };
}

function deriveCategory(path, categoryFromData) {
  if (categoryFromData) return categoryFromData;
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  // For Rizia: Rizia/Royal Decrees Panel/{Category} Decrees[/Sub]
  if (parts.length >= 4 && parts[1].includes("Royal Decrees Panel")) {
    const cat = parts[2] || "";
    const sub = parts[3] || "";
    return [cat.replace(/ Decrees?/i, ""), sub].filter(Boolean).join(" / ");
  }
  // For Sordland: Sordland/Presidential Decrees Panel/Decrees
  if (parts.length >= 3 && parts[1].includes("Decrees Panel")) {
    return parts.slice(2).join(" / ");
  }
  return "";
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
