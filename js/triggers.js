// Triggers & Background Events
// Loads ConditionalInstruction entries from Entity Text Asset and renders them with checks + options.

let allTriggers = [];
let filteredTriggers = [];

document.addEventListener("DOMContentLoaded", () => {
  initTriggersPage().catch((err) => {
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

  if (!listContainer) {
    console.warn("[Triggers] Missing list container");
    return;
  }

  allTriggers = await loadConditionalInstructions();
  filteredTriggers = allTriggers.slice();

  const applyFilters = () => {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const gameFilter = gameSelect?.value || "";

    filteredTriggers = allTriggers.filter((t) => {
      if (gameFilter && t.game !== gameFilter) return false;
      if (!q) return true;
      return t.search.includes(q);
    });
    renderTriggers(listContainer, countInfo);
  };

  searchInput?.addEventListener("input", applyFilters);
  gameSelect?.addEventListener("change", applyFilters);

  // Export (if present)
  const exportBtn = document.getElementById("triggerExportBtn");
  const exportMenu = document.getElementById("triggerExportMenu");
  const exportConfirm = document.getElementById("triggerExportConfirm");
  const exportCancel = document.getElementById("triggerExportCancel");
  const exportCondition = document.getElementById("triggerExportCondition");
  const exportInstruction = document.getElementById("triggerExportInstruction");
  const exportMeta = document.getElementById("triggerExportMeta");

  const toggleExport = (show) => {
    if (!exportMenu) return;
    exportMenu.hidden = !show;
  };

  exportBtn?.addEventListener("click", () => toggleExport(exportMenu?.hidden));
  exportCancel?.addEventListener("click", () => toggleExport(false));
  exportConfirm?.addEventListener("click", () => {
    const includeCond = exportCondition?.checked !== false;
    const includeInstr = exportInstruction?.checked !== false;
    const includeMeta = exportMeta?.checked !== false;
    const list = filteredTriggers.length ? filteredTriggers : allTriggers;
    const lines = [];
    lines.push(`Triggers export (${list.length} items)`);
    lines.push("");
    list.forEach((t) => {
      lines.push(`- ${t.title}`);
      if (includeMeta) {
        const metaBits = [];
        if (t.path) metaBits.push(t.path);
        if (t.id) metaBits.push(`Id ${t.id}`);
        if (t.game) metaBits.push(t.game === "RiziaDLC" ? "Rizia DLC" : "Base game");
        if (t.turnCheck != null && t.turnCheck >= 0) metaBits.push(`Turn ${t.turnCheck}`);
        if (t.stepCheck != null && t.stepCheck >= 0) metaBits.push(`Step ${t.stepCheck}`);
        if (t.priority != null) metaBits.push(`Priority ${t.priority}`);
        if (metaBits.length) lines.push(`  Meta: ${metaBits.join(" | ")}`);
      }
      if (includeCond || includeInstr) {
        t.pairs.forEach((p, idx) => {
          lines.push(`  Option ${idx + 1}:`);
          if (includeCond) lines.push(`    Condition: ${p.condition || "(none)"}`);
          if (includeInstr) lines.push(`    Instruction: ${p.instruction || "(none)"}`);
        });
      }
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "triggers_export.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toggleExport(false);
  });

  document.addEventListener("click", (e) => {
    if (!exportMenu || exportMenu.hidden) return;
    if (e.target === exportMenu || e.target === exportBtn || exportMenu.contains(e.target) || exportBtn?.contains(e.target)) return;
    toggleExport(false);
  });

  renderTriggers(listContainer, countInfo);
}

async function loadConditionalInstructions() {
  const paths = ["../data/Entity%20Text%20Asset.txt", "../data/Entity Text Asset.txt"];
  for (const p of paths) {
    try {
      const raw = await fetch(p).then((r) => r.text());
      const blocks = extractDataBlocks(raw);
      if (!blocks) continue;
      const condRaw =
        blocks.ConditionalInstruction ||
        blocks.ConditionalInstructionDataJson ||
        blocks.ConditionalInstructionData ||
        null;
      if (!condRaw) continue;
      const parsed = JSON.parse(condRaw);
      const items = parsed.items || [];
      const filtered = items.filter((it) => {
        const path = it.Path || "";
        return path.startsWith("Rizia/Conditional Instructions/") || path.startsWith("Sordland/Conditional Instructions/");
      });
      return filtered.map(normalizeTrigger).filter(Boolean);
    } catch (e) {
      console.warn("[Triggers] Failed to load from", p, e);
    }
  }
  throw new Error("No ConditionalInstruction data found in Entity Text Asset.");
}

function normalizeTrigger(item) {
  const path = item.Path || "";
  const props = item.ConditionalInstructionProperties || {};
  const game = path.startsWith("Rizia/") ? "RiziaDLC" : "Base";
  const turnCheck = typeof props.CheckOnTurnNo === "number" ? props.CheckOnTurnNo : -1;
  const stepCheck = typeof props.CheckOnStepNo === "number" ? props.CheckOnStepNo : -1;
  const priority = typeof props.Priority === "number" ? props.Priority : null;
  const pairs = (props.ConditionalInstructions || []).map((pair) => ({
    condition: (pair && (pair.Condition || pair.condition || "")) || "",
    instruction: (pair && (pair.Instruction || pair.instruction || "")) || "",
  }));
  return {
    id: item.Id || "",
    nameInDb: item.NameInDatabase || "",
    path,
    game,
    title: item.NameInDatabase || path || "Trigger",
    turnCheck,
    stepCheck,
    priority,
    checkPerTurn: !!props.CheckPerTurn,
    checkPerStep: !!props.CheckPerStep,
    checkPerStoryFragment: !!props.CheckPerStoryFragment,
    isOneTime: !!props.IsOneTime,
    isDone: !!props.IsDone,
    pairs,
    search: [
      item.NameInDatabase || "",
      path,
      props.CheckOnTurnNo ?? "",
      props.CheckOnStepNo ?? "",
      props.Priority ?? "",
      JSON.stringify(props.ConditionalInstructions || []),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function renderTriggers(container, countInfo) {
  container.innerHTML = "";
  const total = allTriggers.length;
  const vis = filteredTriggers.length;
  if (countInfo) countInfo.textContent = `Showing ${vis} of ${total} triggers`;

  if (!vis) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No triggers match these filters.";
    container.appendChild(empty);
    return;
  }

  filteredTriggers.forEach((t) => container.appendChild(buildTriggerCard(t)));
}

function buildTriggerCard(trigger) {
  const card = document.createElement("article");
  card.className = "card";

  const header = document.createElement("header");
  header.className = "card-header";

  const h3 = document.createElement("h3");
  h3.className = "card-title";
  h3.textContent = trigger.title;
  header.appendChild(h3);

  const subtitle = document.createElement("p");
  subtitle.className = "card-subtitle";
  const checks = [];
  if (trigger.turnCheck >= 0) checks.push(`Turn ${trigger.turnCheck}`);
  if (trigger.stepCheck >= 0) checks.push(`Step ${trigger.stepCheck}`);
  if (trigger.priority != null) checks.push(`Priority ${trigger.priority}`);
  const subText = checks.join(" • ");
  subtitle.textContent = subText;
  if (subText) header.appendChild(subtitle);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const gameTag = document.createElement("span");
  gameTag.className = "tag tag--game";
  gameTag.textContent = trigger.game === "RiziaDLC" ? "Rizia DLC" : "Base game";
  meta.appendChild(gameTag);
  const pathTag = document.createElement("span");
  pathTag.className = "tag";
  pathTag.textContent = trigger.path || "(no path)";
  meta.appendChild(pathTag);
  header.appendChild(meta);

  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "card-body";

  // Checks block (flags)
  const checksBlock = document.createElement("div");
  checksBlock.className = "card-section";
  const checksLabel = document.createElement("div");
  checksLabel.className = "card-section-title";
  checksLabel.textContent = "Checks";
  checksBlock.appendChild(checksLabel);
  const checksInfo = document.createElement("p");
  checksInfo.className = "muted";
  const bits = [];
  if (trigger.checkPerTurn) bits.push("Per turn");
  if (trigger.checkPerStep) bits.push("Per step");
  if (trigger.checkPerStoryFragment) bits.push("Per story fragment");
  if (trigger.isOneTime) bits.push("One-time");
  if (trigger.isDone) bits.push("Done");
  checksInfo.textContent = bits.join(" • ") || "—";
  checksBlock.appendChild(checksInfo);
  body.appendChild(checksBlock);

  // Options list
  const optionsBlock = document.createElement("div");
  optionsBlock.className = "card-section";
  const optLabel = document.createElement("div");
  optLabel.className = "card-section-title";
  optLabel.textContent = "Options";
  optionsBlock.appendChild(optLabel);

  const pairs = Array.isArray(trigger.pairs) ? trigger.pairs : [];
  pairs.forEach((pair, idx) => {
    const sub = document.createElement("div");
    sub.className = "card-subblock";

    const subTitle = document.createElement("div");
    subTitle.className = "card-column-title";
    subTitle.textContent = pairs.length > 1 ? `Option ${idx + 1}` : "Option";
    sub.appendChild(subTitle);

    const condTitle = document.createElement("div");
    condTitle.className = "card-section-title";
    condTitle.textContent = "Condition";
    sub.appendChild(condTitle);
    const condP = document.createElement("p");
    condP.textContent = pair.condition || "(none)";
    sub.appendChild(condP);

    const instrTitle = document.createElement("div");
    instrTitle.className = "card-section-title";
    instrTitle.textContent = "Instruction";
    sub.appendChild(instrTitle);
    const instrP = document.createElement("p");
    instrP.textContent = pair.instruction || "(none)";
    sub.appendChild(instrP);

    optionsBlock.appendChild(sub);
  });

  body.appendChild(optionsBlock);

  card.appendChild(body);
  return card;
}

function extractDataBlocks(text) {
  if (!text) return null;
  const regex = /string\s+(\w+)DataJson\s*=/g;
  const matches = Array.from(text.matchAll(regex));
  if (!matches.length) return null;
  const blocks = {};
  for (const m of matches) {
    const name = m[1];
    const braceStart = text.indexOf("{", m.index);
    if (braceStart === -1) continue;
    const braceEnd = findMatchingBrace(text, braceStart);
    if (braceEnd === -1) continue;
    blocks[name] = text.substring(braceStart, braceEnd + 1);
  }
  return blocks;
}

function findMatchingBrace(str, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

