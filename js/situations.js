// Situations & Policies page loader
// Reads Policies and Situations from Entity Text Asset

let spAllItems = [];
let spFiltered = [];

document.addEventListener("DOMContentLoaded", () => {
  initSituationsPage().catch((err) => {
    console.error("Situations page init failed:", err);
    const info = document.getElementById("spCountInfo");
    if (info) info.textContent = "Failed to load situations & policies.";
  });
});

async function initSituationsPage() {
  spAllItems = await loadSituationsAndPolicies();
  spFiltered = spAllItems.slice();

  // Populate category filter
  const categorySelect = document.getElementById("spCategoryFilter");
  if (categorySelect) {
    const categories = Array.from(new Set(spAllItems.map((i) => i.category).filter(Boolean))).sort();
    categories.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      categorySelect.appendChild(opt);
    });
  }

  const searchInput = document.getElementById("spSearchInput");
  const typeSelect = document.getElementById("spTypeFilter");
  const gameSelect = document.getElementById("spGameFilter");
  const severitySelect = document.getElementById("spSeverityFilter");

  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (typeSelect) typeSelect.addEventListener("change", applyFilters);
  if (gameSelect) gameSelect.addEventListener("change", applyFilters);
  if (severitySelect) severitySelect.addEventListener("change", applyFilters);
  if (categorySelect) categorySelect.addEventListener("change", applyFilters);

  // Export wiring
  const exportBtn = document.getElementById("spExportBtn");
  const exportMenu = document.getElementById("spExportMenu");
  const exportConfirm = document.getElementById("spExportConfirm");
  const exportCancel = document.getElementById("spExportCancel");

  const toggleExport = (show) => {
    if (!exportMenu) return;
    exportMenu.hidden = !show;
  };

  exportBtn?.addEventListener("click", () => toggleExport(exportMenu?.hidden));
  exportCancel?.addEventListener("click", () => toggleExport(false));
  exportConfirm?.addEventListener("click", () => {
    downloadExport();
    toggleExport(false);
  });
  document.addEventListener("click", (e) => {
    if (!exportMenu || exportMenu.hidden) return;
    const t = e.target;
    if (t === exportMenu || t === exportBtn || exportMenu.contains(t) || exportBtn.contains(t)) return;
    toggleExport(false);
  });

  renderList();
}

async function loadSituationsAndPolicies() {
  const paths = ["../data/Entity%20Text%20Asset.txt", "../data/Entity Text Asset.txt"];
  for (const p of paths) {
    try {
      const raw = await fetch(p).then((r) => r.text());
      const blocks = extractDataBlocks(raw);
      if (!blocks) continue;

      const policiesRaw = blocks.Policies || null;
      const situationsRaw = blocks.Situations || null;
      if (!policiesRaw && !situationsRaw) continue;

      const items = [];
      if (policiesRaw) {
        const parsed = JSON.parse(policiesRaw);
        const list = (parsed && parsed.items) || [];
        list.forEach((item) => items.push(normalizePolicy(item)));
      }
      if (situationsRaw) {
        const parsed = JSON.parse(situationsRaw);
        const list = (parsed && parsed.items) || [];
        list.forEach((item) => items.push(normalizeSituation(item)));
      }
      return items.filter(Boolean);
    } catch (e) {
      console.warn("[Situations] Failed to load from", p, e);
    }
  }
  throw new Error("No Policies/Situations data found in Entity Text Asset.");
}

function normalizePolicy(item) {
  if (!item) return null;
  const props = item.PolicyProperties || {};
  const catProps = item.OverviewCategoryProperties || {};
  const path = item.Path || "";
  const fromRizia = path.startsWith("Rizia/");
  return {
    id: item.Id || "",
    nameInDb: item.NameInDatabase || "",
    path,
    game: fromRizia ? "RiziaDLC" : "Base",
    type: "Policy",
    title: props.Title || "(untitled policy)",
    description: props.Description || "",
    variable: props.IsEnabledVariable || "",
    severity: "",
    category: catProps.OverviewCategoryString || "Other",
  };
}

function normalizeSituation(item) {
  if (!item) return null;
  const props = item.SituationProperties || {};
  const catProps = item.OverviewCategoryProperties || {};
  const path = item.Path || "";
  const fromRizia = path.startsWith("Rizia/");
  return {
    id: item.Id || "",
    nameInDb: item.NameInDatabase || "",
    path,
    game: fromRizia ? "RiziaDLC" : "Base",
    type: "Situation",
    title: props.Title || "(untitled situation)",
    description: props.Description || "",
    variable: props.IsEnabledVariable || "",
    severity: props.SituationSeverityString || "",
    category: catProps.OverviewCategoryString || "Other",
  };
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

function applyFilters() {
  const search = document.getElementById("spSearchInput")?.value.trim().toLowerCase() || "";
  const type = document.getElementById("spTypeFilter")?.value || "";
  const category = document.getElementById("spCategoryFilter")?.value || "";
  const severity = document.getElementById("spSeverityFilter")?.value || "";
  const game = document.getElementById("spGameFilter")?.value || "";

  spFiltered = spAllItems.filter((item) => {
    if (type && item.type !== type) return false;
    if (category && item.category !== category) return false;
    if (severity && item.type === "Situation" && item.severity !== severity) return false;
    if (game && item.game !== game) return false;
    if (search) {
      const hay = [item.title, item.description, item.variable, item.nameInDb, item.path]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  renderList();
}

function renderList() {
  const container = document.getElementById("spList");
  const countInfo = document.getElementById("spCountInfo");
  if (!container) return;

  container.innerHTML = "";
  const total = spAllItems.length;
  const visible = spFiltered.length;
  if (countInfo) countInfo.textContent = `Showing ${visible} of ${total} entries`;

  if (!visible) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No entries match these filters.";
    container.appendChild(empty);
    return;
  }

  // Group by type then category
  const byType = new Map();
  spFiltered.forEach((item) => {
    if (!byType.has(item.type)) byType.set(item.type, new Map());
    const catMap = byType.get(item.type);
    const key = item.category || "Other";
    if (!catMap.has(key)) catMap.set(key, []);
    catMap.get(key).push(item);
  });

  const typeOrder = ["Policy", "Situation"];
  typeOrder.forEach((type) => {
    const catMap = byType.get(type);
    if (!catMap) return;
    const typePanel = document.createElement("details");
    typePanel.className = "panel";
    typePanel.open = false;
    const summary = document.createElement("summary");
    summary.className = "panel-title";
    const totalCount = Array.from(catMap.values()).reduce((acc, arr) => acc + arr.length, 0);
    const typeLabel = type === "Policy" ? "Policies" : `${type}s`;
    summary.textContent = `${typeLabel} (${totalCount})`;
    typePanel.appendChild(summary);

    const body = document.createElement("div");
    body.className = "cards-container";
    typePanel.appendChild(body);

    const cats = Array.from(catMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    cats.forEach(([cat, list]) => {
      const catPanel = document.createElement("details");
      catPanel.className = "panel nested";
      catPanel.open = false;
      const catSummary = document.createElement("summary");
      catSummary.className = "panel-title";
      catSummary.textContent = `${cat} (${list.length})`;
      catPanel.appendChild(catSummary);

      const catBody = document.createElement("div");
      catBody.className = "cards-container";
      list
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .forEach((item) => {
          catBody.appendChild(createCard(item));
        });
      catPanel.appendChild(catBody);
      body.appendChild(catPanel);
    });

    container.appendChild(typePanel);
  });
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "card";

  const header = document.createElement("header");
  header.className = "card-header";

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = item.title;
  header.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const typeTag = document.createElement("span");
  typeTag.className = "tag";
  typeTag.textContent = item.type;
  meta.appendChild(typeTag);

  const catTag = document.createElement("span");
  catTag.className = "tag tag--section";
  catTag.textContent = item.category;
  meta.appendChild(catTag);

  const gameTag = document.createElement("span");
  gameTag.className = "tag tag--game";
  gameTag.textContent = item.game === "RiziaDLC" ? "Rizia DLC" : "Base game";
  meta.appendChild(gameTag);

  if (item.severity) {
    const sevTag = document.createElement("span");
    sevTag.className = "tag";
    sevTag.textContent = `Severity: ${item.severity}`;
    meta.appendChild(sevTag);
  }

  header.appendChild(meta);
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "card-body";

  if (item.description) {
    const desc = document.createElement("p");
    desc.className = "card-description";
    desc.textContent = item.description;
    body.appendChild(desc);
  }

  if (item.variable) {
    const varBlock = document.createElement("div");
    varBlock.className = "card-section";
    const label = document.createElement("div");
    label.className = "card-section-title";
    label.textContent = "Variable";
    const code = document.createElement("code");
    code.className = "card-code";
    code.textContent = item.variable;
    varBlock.appendChild(label);
    varBlock.appendChild(code);
    body.appendChild(varBlock);
  }

  const metaList = [];
  if (item.nameInDb) metaList.push(item.nameInDb);
  if (item.path) metaList.push(item.path);
  if (metaList.length) {
    const metaBlock = document.createElement("div");
    metaBlock.className = "card-section";
    const label = document.createElement("div");
    label.className = "card-section-title";
    label.textContent = "Meta";
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = metaList.join(" • ");
    metaBlock.appendChild(label);
    metaBlock.appendChild(p);
    body.appendChild(metaBlock);
  }

  card.appendChild(body);
  return card;
}

function downloadExport() {
  const includeDesc = document.getElementById("spExportDescription")?.checked !== false;
  const includeMeta = document.getElementById("spExportMeta")?.checked !== false;
  const list = spFiltered.length ? spFiltered : spAllItems;
  const lines = [];
  lines.push(`Situations & Policies export (${list.length} items)`);
  lines.push("");
  list.forEach((item) => {
    lines.push(`- ${item.type}: ${item.title}`);
    if (includeMeta) {
      const metaBits = [];
      if (item.category) metaBits.push(item.category);
      if (item.type) metaBits.push(item.type);
      if (item.game) metaBits.push(item.game === "RiziaDLC" ? "Rizia DLC" : "Base game");
      if (item.path) metaBits.push(item.path);
      if (metaBits.length) lines.push(`  Meta: ${metaBits.join(" | ")}`);
    }
    if (item.variable) {
      lines.push(`  Variable: ${item.variable}`);
    }
    if (includeDesc && item.description) {
      lines.push(`  Description: ${item.description}`);
    }
    lines.push("");
  });
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "situations_policies_export.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
