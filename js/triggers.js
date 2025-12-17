// js/triggers.js
// Triggers / Events:
// ConditionalInstructionData.txt (global rules)
// HUDPeriodicStatModifierData.txt (per-turn modifiers)

const RIZIA_PATH_PREFIX = "Rizia/";
const SORDLAND_PATH_PREFIX = "Sordland/";
const RIZIA_TOKEN = "RiziaDLC";

document.addEventListener("DOMContentLoaded", () => {
  initTriggersPage().catch(err => {
    console.error("Error initializing Triggers page:", err);
    const info = document.getElementById("triggerCountInfo");
    if (info) info.textContent = "Failed to load triggers.";
  });
});

async function initTriggersPage() {
  const searchInput = document.getElementById("triggerSearchInput");
  const gameSelect = document.getElementById("triggerGameFilter");
  const countInfo = document.getElementById("triggerCountInfo");
  const listContainer = document.getElementById("triggerList");
  const exportBtn = document.getElementById("triggerExportBtn");
  const exportMenu = document.getElementById("triggerExportMenu");
  const exportConfirm = document.getElementById("triggerExportConfirm");
  const exportCancel = document.getElementById("triggerExportCancel");
  const exportCondition = document.getElementById("triggerExportCondition");
  const exportInstruction = document.getElementById("triggerExportInstruction");
  const exportMeta = document.getElementById("triggerExportMeta");

  if (!searchInput || !countInfo || !listContainer) {
    console.warn("Triggers page: missing DOM elements, aborting init.");
    return;
  }

  countInfo.textContent = "Loading triggers...";

  // ---- Load both files in parallel ----
  const [condRaw, hudRaw] = await Promise.all([
    DataLoader.loadText("../data/ConditionalInstructionData.txt"),
    DataLoader.loadText("../data/HUDPeriodicStatModifierData.txt").catch(() => "")
  ]);

  // ---- Parse ConditionalInstructionData ----
  const condEntries = parseConditionalEntries(condRaw);

  // ---- Parse HUDPeriodicStatModifierData ----
  const hudItems = parseHudPeriodicItems(hudRaw);

  // ---- Build trigger records from both ----
  /** @type {TriggerRecord[]} */
  const condTriggers = buildTriggersFromConditionalEntries(condEntries);
  /** @type {TriggerRecord[]} */
  const hudTriggers = buildTriggersFromHudItems(hudItems);

  /** @type {TriggerRecord[]} */
  const allTriggers = [...condTriggers, ...hudTriggers];
  let filteredTriggers = allTriggers.slice();

  // ---- Helpers ----

  function triggerGameKey(t) {
    return t.gameKey || "Base";
  }

  function updateCounts() {
    const total = allTriggers.length;
    const vis = filteredTriggers.length;

    countInfo.textContent = `Showing ${vis} of ${total} triggers`;

  }

  function buildTriggerCard(trigger) {
    const card = document.createElement("article");
    card.className = "card";

    const header = document.createElement("header");
    header.className = "card-header";

    const h3 = document.createElement("h3");
    h3.className = "card-title";
    h3.textContent = trigger.title || "Unnamed trigger";
    header.appendChild(h3);

    const subtitle = document.createElement("p");
    subtitle.className = "card-subtitle";

    const bits = [];
    if (trigger.id) bits.push(`Id ${trigger.id}`);
    if (trigger.nameInDb) bits.push(trigger.nameInDb);
    if (trigger.path) bits.push(trigger.path);
    if (trigger.turnCheck != null && trigger.turnCheck >= 0) {
      bits.push(`Turn ${trigger.turnCheck}`);
    }
    if (trigger.source === "hud") {
      bits.push("HUD periodic modifier");
    } else if (trigger.source === "conditional") {
      bits.push("Global rule");
    }
    subtitle.textContent = bits.join(" Â· ");
    header.appendChild(subtitle);

    const meta = document.createElement("span");
    meta.className = "card-meta";
    meta.textContent =
      trigger.gameKey === "RiziaDLC" ? "Rizia DLC" : "Base game";
    header.appendChild(meta);

    const body = document.createElement("div");
    body.className = "card-body";

    const columns = document.createElement("div");
    columns.className = "card-columns";

    const condCol = document.createElement("div");
    condCol.className = "card-column";
    const condTitle = document.createElement("h4");
    condTitle.className = "card-column-title";
    condTitle.textContent = "Condition";
    condCol.appendChild(condTitle);
    const condP = document.createElement("p");
    condP.textContent = trigger.condition || "(none)";
    condCol.appendChild(condP);

    const effCol = document.createElement("div");
    effCol.className = "card-column";
    const effTitle = document.createElement("h4");
    effTitle.className = "card-column-title";
    effTitle.textContent = trigger.source === "hud" ? "Modifier" : "Instruction";
    effCol.appendChild(effTitle);
    const effP = document.createElement("p");
    effP.textContent = trigger.instruction || "(none)";
    effCol.appendChild(effP);

    columns.appendChild(condCol);
    columns.appendChild(effCol);

    body.appendChild(columns);
    card.appendChild(body);

    return card;
  }

  function renderList() {
    listContainer.innerHTML = "";
    const frag = document.createDocumentFragment();
    filteredTriggers.forEach(t => frag.appendChild(buildTriggerCard(t)));
    listContainer.appendChild(frag);
    updateCounts();
  }

  // ---- Filtering ----

  function applyFilters() {
    const query = searchInput.value.trim();
    const gameFilter = gameSelect ? gameSelect.value : "";

    filteredTriggers = allTriggers.filter(t => {
      if (gameFilter && triggerGameKey(t) !== gameFilter) return false;

      if (!query) return true;

      return FilterUtils.textMatch(t, query, [
        "title",
        "nameInDb",
        "path",
        "condition",
        "instruction"
      ]);
    });

    renderList();
  }

  searchInput.addEventListener("input", applyFilters);
  if (gameSelect) gameSelect.addEventListener("change", applyFilters);

  function toggleExportMenu(show) {
    if (!exportMenu) return;
    exportMenu.hidden = !show;
  }

  function buildExportText() {
    const includeCond = exportCondition?.checked !== false;
    const includeInstr = exportInstruction?.checked !== false;
    const includeMeta = exportMeta?.checked !== false;
    const lines = [];
    lines.push(`Triggers export (${filteredTriggers.length} items)`);
    lines.push("");
    filteredTriggers.forEach(t => {
      lines.push(`- ${t.title || t.nameInDb || t.path || "Trigger"}`);
      if (includeMeta) {
        const meta = [];
        if (t.id) meta.push(`Id ${t.id}`);
        if (t.nameInDb) meta.push(t.nameInDb);
        if (t.path) meta.push(t.path);
        if (t.gameKey) meta.push(t.gameKey === "RiziaDLC" ? "Rizia DLC" : "Base game");
        if (meta.length) lines.push(`  Meta: ${meta.join(" | ")}`);
      }
      if (includeCond && t.condition) {
        lines.push(`  Condition: ${t.condition}`);
      }
      if (includeInstr && t.instruction) {
        lines.push(`  Instruction: ${t.instruction}`);
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
    a.download = "triggers_export.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toggleExportMenu(false);
  }

  if (exportBtn) exportBtn.addEventListener("click", () => toggleExportMenu(exportMenu?.hidden));
  if (exportCancel) exportCancel.addEventListener("click", () => toggleExportMenu(false));
  if (exportConfirm) exportConfirm.addEventListener("click", downloadExport);
  document.addEventListener("click", e => {
    if (!exportMenu || exportMenu.hidden) return;
    const t = e.target;
    if (t === exportMenu || t === exportBtn || exportMenu.contains(t) || exportBtn.contains(t)) return;
    toggleExportMenu(false);
  });

  // Initial render
  applyFilters();
}

/* ---------- Parsing helpers ---------- */

// Try to use your parser for ConditionalInstructionData; fall back to JSON.
function parseConditionalEntries(raw) {
  if (!raw) return [];

  try {
    if (typeof SuzerainParser !== "undefined" &&
        typeof SuzerainParser.parseConditionalInstructions === "function") {

      const parsed = SuzerainParser.parseConditionalInstructions(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
      if (parsed && Array.isArray(parsed.rules)) return parsed.rules;
      console.warn("parseConditionalInstructions: unexpected shape", parsed);
      return [];
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    console.warn("ConditionalInstructionData JSON: unexpected shape", parsed);
    return [];
  } catch (e) {
    console.error("Failed to parse ConditionalInstructionData", e);
    return [];
  }
}

// HUDPeriodicStatModifierData.txt format (from your sample):
// { "items": [ { Id, NameInDatabase, Path, HUDPeriodicStatModifierProperties: {...} }, ... ] }
function parseHudPeriodicItems(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    console.warn("HUDPeriodicStatModifierData JSON: unexpected shape", parsed);
    return [];
  } catch (e) {
    console.error("Failed to parse HUDPeriodicStatModifierData", e);
    return [];
  }
}

/* ---------- Build Trigger records ---------- */

// ConditionalInstructionData â†’ TriggerRecord[]
function buildTriggersFromConditionalEntries(entries) {
  /** @type {TriggerRecord[]} */
  const out = [];
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    if (!entry) continue;

    const id = entry.Id || entry.id || "";
    const nameInDb = entry.NameInDatabase || entry.nameInDb || "";
    const path = entry.Path || entry.path || "";
    const props =
      entry.ConditionalInstructionProperties ||
      entry.properties ||
      {};
    const turnCheck =
      typeof props.CheckOnTurnNo === "number" ? props.CheckOnTurnNo : -1;
    const list =
      props.ConditionalInstructions ||
      props.instructions ||
      entry.ConditionalInstructions ||
      [];

    const textPieces = [];
    for (const o of list || []) {
      if (!o) continue;
      textPieces.push(o.Condition || o.condition || "");
      textPieces.push(o.Instruction || o.instruction || "");
    }

    const gameKey = inferGameKey(path, textPieces);
    const title = nameInDb || path || (id ? `Instruction ${id}` : "Instruction");

    for (const obj of list) {
      if (!obj) continue;
      const cond = obj.Condition || obj.condition || "";
      const instr = obj.Instruction || obj.instruction || "";

      out.push({
        source: "conditional",
        gameKey,
        id,
        nameInDb,
        path,
        turnCheck,
        title,
        condition: cond,
        instruction: instr
      });
    }
  }

  return out;
}

// HUDPeriodicStatModifierData â†’ TriggerRecord[]
function buildTriggersFromHudItems(items) {
  /** @type {TriggerRecord[]} */
  const out = [];
  if (!Array.isArray(items)) return out;

  for (const entry of items) {
    if (!entry) continue;

    const id = entry.Id || entry.id || "";
    const nameInDb = entry.NameInDatabase || entry.nameInDb || "";
    const path = entry.Path || entry.path || "";

    const props =
      entry.HUDPeriodicStatModifierProperties ||
      entry.properties ||
      {};

    const variable = props.Variable || "";
    const condition = props.Condition || "";
    const description = props.Description || "";

    const textPieces = [variable, condition, description];
    const gameKey = inferGameKey(path, textPieces);

    const title = nameInDb || path || (id ? `HUD Modifier ${id}` : "HUD Modifier");
    const instruction = variable
      ? `${variable} – ${description || "Periodic modifier"}`
      : description || "Periodic modifier";

    out.push({
      source: "hud",
      gameKey,
      id,
      nameInDb,
      path,
      turnCheck: -1,
      title,
      condition,
      instruction
    });
  }

  return out;
}

/* ---------- Shared helpers ---------- */

// Sordland/ = Base, Rizia/ = DLC. If path missing, fall back to looking for "RiziaDLC".
function inferGameKey(path, textPieces) {
  if (path.startsWith(RIZIA_PATH_PREFIX)) return "RiziaDLC";
  if (path.startsWith(SORDLAND_PATH_PREFIX)) return "Base";

  const joined = (textPieces || []).join(" ");
  if (joined.includes(RIZIA_TOKEN)) return "RiziaDLC";

  return "Base";
}

/**
 * @typedef {Object} TriggerRecord
 * @property {"conditional"|"hud"} source
 * @property {"Base"|"RiziaDLC"} gameKey
 * @property {string} [id]
 * @property {string} [nameInDb]
 * @property {string} [path]
 * @property {number} [turnCheck]
 * @property {string} title
 * @property {string} condition
 * @property {string} instruction
 */


