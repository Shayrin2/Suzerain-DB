// panels.js
// Prologue + Decisions/Budget options viewer
// Uses MultipleChoiceOptionData.json + CarouselChoiceOptionData.json

let allPanelOptions = [];
let lastPanelFiltered = [];

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    console.error("Failed to load", path, res.status, res.statusText);
    return { items: [] };
  }
  return res.json();
}

function normalizeItems(rawItems, sourceType) {
  if (!rawItems || !Array.isArray(rawItems)) return [];

  return rawItems.map((item) => {
    const path = item.Path || "";
    const fromRizia = path.startsWith("Rizia/");
    const game = fromRizia ? "RiziaDLC" : "Base";

    const props =
      item.MultipleChoiceOptionProperties ||
      item.CarouselChoiceOptionProperties ||
      {};

    const title = props.Title || "(untitled)";
    const description = props.Description || "";
    const condition = props.Condition || "";
    const instruction = props.Instruction || "";

    // Section: Prologue vs Decisions & Budget
    // Prologue: things under Prologue / Prologue Skip pages
    const isPrologue =
      path.includes("Prologue Skip") ||
      path.includes("/Prologue ") ||
      path.endsWith("/Prologue");

    const section = isPrologue ? "Prologue" : "DecisionsBudget";

    // Panel name / category from Path, e.g.
    // "Sordland/Paged Decision Panels/Budget Panel/Healthcare"
    const pathParts = path.split("/").filter(Boolean);
    let panelGroup = "";
    let panelSub = "";

    if (pathParts.length >= 3 && pathParts[1] === "Paged Decision Panels") {
      panelGroup = pathParts[2]; // e.g. "Promises Panel", "Budget Panel"
      panelSub = pathParts[3] || ""; // e.g. "Diplomacy", "Healthcare"
    } else if (pathParts.length >= 2 && pathParts[1] === "Prologue Skip") {
      panelGroup = "Prologue Skip";
      panelSub = pathParts[2] || "";
    } else {
      // Fallback
      panelGroup = pathParts[1] || "";
      panelSub = pathParts[2] || "";
    }

    // Split instructions into individual operations
    const effects = instruction
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      id: item.Id || "",
      nameInDb: item.NameInDatabase || "",
      path,
      game,
      sourceType,
      section,
      panelGroup,
      panelSub,
      title,
      description,
      condition,
      instruction,
      effects,
      panelCounterIncrement: props.PanelCounterIncrement ?? null,
      panelBarIncrement: props.PanelBarIncrement ?? null
    };
  });
}

function matchesFilters(option, filters) {
  const { search, section, game } = filters;

  if (section && option.section !== section) return false;
  if (game && option.game !== game) return false;

  if (search) {
    const s = search.toLowerCase();
    const hay = [
      option.title,
      option.description,
      option.condition,
      option.instruction,
      option.nameInDb
    ].join(' ').toLowerCase();
    if (!hay.includes(s)) return false;
  }
  return true;
}

function renderPanels() {
  lastPanelFiltered = [];
  const container = document.getElementById("panelResults");
  const searchInput = document.getElementById("panelSearchInput");
  const sectionSelect = document.getElementById("panelSectionFilter");
  const gameSelect = document.getElementById("panelGameFilter");
  const countInfo = document.getElementById("panelCountInfo");

  if (!container) return;

  const groupingSelect = document.getElementById("panelGroupingFilter");
  const filters = {
    search: searchInput?.value.trim() || "",
    section: sectionSelect?.value || "",
    game: gameSelect?.value || "",
    grouping: groupingSelect?.value || "Category"
  };

  const filtered = allPanelOptions.filter((o) => matchesFilters(o, filters));
  lastPanelFiltered = filtered;

  container.innerHTML = "";

  const total = allPanelOptions.length;
  if (countInfo) {
    countInfo.textContent = `Showing ${filtered.length} of ${total} options`;
  }

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No options match these filters.";
    container.appendChild(empty);
    return;
  }

  // sort: Prologue first, then by panel group, then title
  filtered.sort((a, b) => {
    if (a.section !== b.section) {
      return a.section.localeCompare(b.section);
    }
    if (a.panelGroup !== b.panelGroup) {
      return a.panelGroup.localeCompare(b.panelGroup);
    }
    if (a.panelSub !== b.panelSub) {
      return a.panelSub.localeCompare(b.panelSub);
    }
    return a.title.localeCompare(b.title);
  });

  // Group by section, then by panelSub or panelGroup + panelSub based on grouping
  const sectionGroups = new Map();
  for (const opt of filtered) {
    if (!sectionGroups.has(opt.section)) sectionGroups.set(opt.section, new Map());
    const subMap = sectionGroups.get(opt.section);
    const key = filters.grouping === "Path" ? (() => {
      if (opt.panelGroup === "Prologue Skip") {
        return `Prologue - ${prettifyCategory(opt.panelSub)}`;
      }
      const group = opt.panelGroup.replace(" Panel", "");
      const sub = opt.panelSub;
      return `${prettifyCategory(group)} - ${sub}`;
    })() : getCategoryKey(opt.panelGroup, opt.panelSub) || "Other";
    if (!subMap.has(key)) subMap.set(key, []);
    subMap.get(key).push(opt);
  }

  for (const [section, subMap] of sectionGroups) {
    const sortedSubs = Array.from(subMap.entries()).sort(([a], [b]) => {
      const aParts = a.split(" - ");
      const bParts = b.split(" - ");
      if (aParts.length === 2 && bParts.length === 2) {
        const [aPrefix, aSuffix] = aParts;
        const [bPrefix, bSuffix] = bParts;
        if (aPrefix === bPrefix) {
          if (aPrefix === "Constitution" && aSuffix.startsWith("Section") && bSuffix.startsWith("Section")) {
            const numA = parseInt(aSuffix.split(" ")[1]);
            const numB = parseInt(bSuffix.split(" ")[1]);
            return numA - numB;
          }
          return aSuffix.localeCompare(bSuffix);
        }
        return aPrefix.localeCompare(bPrefix);
      }
      return a.localeCompare(b);
    });
    for (const [sub, opts] of sortedSubs) {
      if (sub !== "Other") {
        // Group into a panel
        const panel = document.createElement("details");
        panel.className = "panel";
        panel.open = false;
        const summary = document.createElement("summary");
        summary.className = "panel-title";
        const title = filters.grouping === "Path" ? sub : prettifyCategory(sub);
        summary.textContent = `${title} (${opts.length})`;
        panel.appendChild(summary);
        const body = document.createElement("div");
        body.className = "cards-container";
        panel.appendChild(body);
        for (const opt of opts) {
          const card = createPanelCard(opt);
          body.appendChild(card);
        }
        container.appendChild(panel);
      } else {
        // Render individual cards
        for (const opt of opts) {
          const card = createPanelCard(opt);
          container.appendChild(card);
        }
      }
    }
  }
}

function getCategoryKey(panelGroup, panelSub) {
  if (panelGroup.includes("Constitution") && !panelGroup.includes("Decree")) {
    return `Constitution - ${panelSub}`;
  }
  if (panelGroup === "Prologue Skip") {
    return `Prologue - ${prettifyCategory(panelSub)}`;
  }
  return `${panelGroup.replace(" Panel", "")} - ${panelSub}`;
}

function prettifyCategory(sub) {
  const map = {
    "Education": "Education Budget",
    "Healthcare": "Healthcare Budget",
    "Military": "Military Budget",
    "Security": "Security Budget",
    "Diplomacy": "Diplomatic Alignment",
    "Immigration": "Immigration Policy",
    "Focus": "Term Focus Area",
    "Section 1": "Constitution Section 1",
    "Section 2": "Constitution Section 2",
    "Section 3": "Constitution Section 3",
    "Section 4": "Constitution Section 4",
    "Section 5": "Constitution Section 5",
    "Section 6": "Constitution Section 6",
    "Section 7": "Constitution Section 7",
    "Section 8": "Constitution Section 8",
    "Section 9": "Constitution Section 9",
    "Arrested People": "Executions - Arrested People",
    "Execution Method": "Executions - Method",
    "Page_Education": "Education",
    "Page_ReclamationWarProtests": "War Protests",
    "Page_DukeValenqiris": "Duke Valenqiris",
    "Page_CampaignPromise": "Campaign Promises",
    "Page_CrownPrinceFocus": "Crown Prince's Focus",
    "Page_DiversityOrNationalism": "Diversity vs Nationalism",
    "Page_Extracurricular": "Extracurricular Activities",
    "Page_Family": "Family - Involvement",
    "Page_FamilyBoatTrip": "Family - Boat Trip",
    "Page_FormativeYearsAnton": "Formative Years (Anton)",
    "Page_FormativeYearsRomus": "Formative Years (Romus)",
    "Page_Kidnapping": "Kidnapping Incident",
    "Page_OppositionUSP": "Opposition to USP",
    "Page_PalesRelations": "Pales Relations",
    "Page_RelationshipFather": "Relationship with Father",
    "Page_RelationshipToPabel": "Relationship to Pabel",
    "Page_Religious": "Religious Alignment",
    "Page_RoyalFamily": "Royal Family Dynamics",
    "Page_SummersInRizia":  "Summers in Rizia",
    "Page_TakePower": "Taking Power",
    "Page_University": "University Life",
    "Page_YouthOrganization": "Youth Organization Involvement"
  };
  return map[sub] || sub;
}

function createPanelCard(opt) {
  const card = document.createElement("article");
  card.className = "card";

  const header = document.createElement("header");
  header.className = "card-header";

  const h3 = document.createElement("h3");
  h3.className = "card-title";
  h3.textContent = opt.title;

  const meta = document.createElement("div");
  meta.className = "card-meta";

  const sectionSpan = document.createElement("span");
  sectionSpan.className = "tag tag--section";
  sectionSpan.textContent = opt.section === "Prologue" ? "Prologue" : "Decisions & Budget";
  meta.appendChild(sectionSpan);

  if (opt.panelGroup) {
    const panelSpan = document.createElement("span");
    panelSpan.className = "tag";
    if (opt.panelGroup === "Prologue Skip") {
      panelSpan.textContent = "Prologue";
    } else {
      const group = opt.panelGroup.replace(/ Panel$/, "");
      const sub = opt.panelSub;
      panelSpan.textContent = group + (sub ? " â€“ " + sub : "");
    }
    meta.appendChild(panelSpan);
  }

  const gameSpan = document.createElement("span");
  gameSpan.className = "tag tag--game";
  gameSpan.textContent = opt.game === "RiziaDLC" ? "Rizia DLC" : "Base game";
  meta.appendChild(gameSpan);

  header.appendChild(h3);
  header.appendChild(meta);
  card.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "card-body";

  if (opt.description) {
    const desc = document.createElement("p");
    desc.className = "card-description muted";
    desc.textContent = opt.description;
    body.appendChild(desc);
  }

  // Condition
  if (opt.condition) {
    const condBlock = document.createElement("div");
    condBlock.className = "card-section";
    const label = document.createElement("div");
    label.className = "card-section-title";
    label.textContent = "Condition";
    const code = document.createElement("code");
    code.className = "card-code";
    code.textContent = opt.condition;
    condBlock.appendChild(label);
    condBlock.appendChild(code);
    body.appendChild(condBlock);
  }

  // Effects (instruction)
  if (opt.effects && opt.effects.length) {
    const effBlock = document.createElement("div");
    effBlock.className = "card-section";
    const label = document.createElement("div");
    label.className = "card-section-title";
    label.textContent = "Effects";
    const list = document.createElement("ul");
    list.className = "effect-list";

    for (const line of opt.effects) {
      const li = document.createElement("li");
      li.textContent = line;
      list.appendChild(li);
    }

    effBlock.appendChild(label);
    effBlock.appendChild(list);
    body.appendChild(effBlock);
  }

  // Panel increments
  if (
    opt.panelCounterIncrement !== null ||
    opt.panelBarIncrement !== null
  ) {
    const metaBlock = document.createElement("div");
    metaBlock.className = "card-section meta-row";
    const pieces = [];

    if (opt.panelCounterIncrement !== null) {
      pieces.push(
        `Panel counter: ${opt.panelCounterIncrement >= 0 ? "+" : ""}${
          opt.panelCounterIncrement
        }`
      );
    }
    if (opt.panelBarIncrement !== null) {
      pieces.push(
        `Panel bar: ${opt.panelBarIncrement >= 0 ? "+" : ""}${
          opt.panelBarIncrement
        }`
      );
    }

    metaBlock.textContent = pieces.join(" Â· ");
    body.appendChild(metaBlock);
  }

  card.appendChild(body);
  return card;
}

async function initPanelsPage() {
  const [multi, carousel] = await Promise.all([
    loadJson("../data/MultipleChoiceOptionData.json"),
    loadJson("../data/CarouselChoiceOptionData.json")
  ]);

  allPanelOptions = [
    ...normalizeItems(multi.items, "multiple"),
    ...normalizeItems(carousel.items, "carousel")
  ];

  // Deduplicate by title and sub to remove repeats
  const unique = new Map();
  for (const opt of allPanelOptions) {
    const key = `${opt.title}-${opt.panelSub}`;
    if (!unique.has(key)) {
      unique.set(key, opt);
    }
  }
  allPanelOptions = Array.from(unique.values());

  // Wire filters
  const searchInput = document.getElementById("panelSearchInput");
  const sectionSelect = document.getElementById("panelSectionFilter");
  const gameSelect = document.getElementById("panelGameFilter");
  const groupingSelect = document.getElementById("panelGroupingFilter");
  const exportBtn = document.getElementById("panelExportBtn");
  const exportMenu = document.getElementById("panelExportMenu");
  const exportConfirm = document.getElementById("panelExportConfirm");
  const exportCancel = document.getElementById("panelExportCancel");
  const exportDescription = document.getElementById("panelExportDescription");
  const exportCondition = document.getElementById("panelExportCondition");
  const exportEffects = document.getElementById("panelExportEffects");
  const exportMeta = document.getElementById("panelExportMeta");

  if (searchInput)
    searchInput.addEventListener("input", () => renderPanels());
  if (sectionSelect)
    sectionSelect.addEventListener("change", () => renderPanels());
  if (gameSelect)
    gameSelect.addEventListener("change", () => renderPanels());
  if (groupingSelect)
    groupingSelect.addEventListener("change", () => renderPanels());

  function toggleExport(show) {
    if (!exportMenu) return;
    exportMenu.hidden = !show;
  }

  function buildExportText(list) {
    const includeDesc = exportDescription?.checked !== false;
    const includeCond = exportCondition?.checked !== false;
    const includeEff = exportEffects?.checked !== false;
    const includeMeta = exportMeta?.checked !== false;
    const lines = [];
    lines.push(`Panels export (${list.length} items)`);
    lines.push("");
    list.forEach(opt => {
      lines.push(`- ${opt.title || opt.nameInDb || opt.path || "Panel option"}`);
      if (includeMeta) {
        const meta = [];
        if (opt.section) meta.push(opt.section);
        if (opt.panelGroup) meta.push(opt.panelGroup);
        if (opt.panelSub) meta.push(opt.panelSub);
        if (opt.path) meta.push(opt.path);
        if (opt.game) meta.push(opt.game === "RiziaDLC" ? "Rizia DLC" : "Base game");
        if (meta.length) lines.push(`  Meta: ${meta.join(" | ")}`);
      }
      if (includeDesc && opt.description) {
        lines.push(`  Description: ${opt.description}`);
      }
      if (includeCond && opt.condition) {
        lines.push(`  Condition: ${opt.condition}`);
      }
      if (includeEff && opt.effects && opt.effects.length) {
        lines.push(`  Effects: ${opt.effects.join(" | ")}`);
      }
      lines.push("");
    });
    return lines.join("\n");
  }

  function downloadExport() {
    const list = (lastPanelFiltered && lastPanelFiltered.length) ? lastPanelFiltered : allPanelOptions;
    const content = buildExportText(list);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "panels_export.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toggleExport(false);
  }

  exportBtn?.addEventListener("click", () => toggleExport(exportMenu?.hidden));
  exportCancel?.addEventListener("click", () => toggleExport(false));
  exportConfirm?.addEventListener("click", downloadExport);
  document.addEventListener("click", e => {
    if (!exportMenu || exportMenu.hidden) return;
    const t = e.target;
    if (t === exportMenu || t === exportBtn || exportMenu.contains(t) || exportBtn.contains(t)) return;
    toggleExport(false);
  });

  renderPanels();
}

document.addEventListener("DOMContentLoaded", initPanelsPage);
