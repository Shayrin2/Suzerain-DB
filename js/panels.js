// panels.js
// Prologue + Decisions/Budget options viewer
// Loads MultipleChoiceOptionDataJson + CarouselChoiceOptionDataJson from Entity Text Asset

let allPanelOptions = [];
let lastPanelFiltered = [];

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

    // Panel name / category from Path, e.g.
    // "Sordland/Paged Decision Panels/Budget Panel/Healthcare"
    const pathParts = path.split("/").filter(Boolean);
    let panelGroup = "";
    let panelSub = "";

    if (pathParts.length >= 3 && pathParts[1].toLowerCase().includes("paged decision")) {
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

    // Section derived from path / panel group
    const isPrologue =
      path.includes("Prologue Skip") ||
      path.includes("/Prologue ") ||
      path.endsWith("/Prologue");

    const section = deriveSection(panelGroup, panelSub, path, isPrologue);

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

function deriveSection(panelGroup, panelSub, path, isPrologue) {
  if (isPrologue) return "Prologue";
  const combo = `${panelGroup || ""} ${panelSub || ""} ${path || ""}`.toLowerCase();

  if (
    combo.includes("negotiation") ||
    combo.includes("nationalization demands") ||
    combo.includes("demands panel")
  )
    return "Negotiations";
  if (combo.includes("budget")) return "Budget";
  if (combo.includes("constitution")) return "Constitution";
  if (combo.includes("promise")) return "Promises";
  if (combo.includes("execution")) return "Executions";
  if (combo.includes("focus")) return "Focus";
  if (combo.includes("nationalization")) return "Nationalization";
  if (combo.includes("privatization")) return "Privatization";
  if (combo.includes("emergency decree")) return "Emergency Decree";
  return "Other";
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
    ].join(" ").toLowerCase();
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
    const key =
      filters.grouping === "Path"
        ? (() => {
            if (opt.panelGroup === "Prologue Skip") {
              return `Prologue - ${prettifyCategory(opt.panelSub)}`;
            }
            const group = opt.panelGroup.replace(" Panel", "");
            const sub = opt.panelSub;
            return `${prettifyCategory(group)} - ${sub}`;
          })()
        : getCategoryKey(opt.panelGroup, opt.panelSub) || "Other";
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
          if (
            aPrefix === "Constitution" &&
            aSuffix.startsWith("Section") &&
            bSuffix.startsWith("Section")
          ) {
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
    Budget: "Budget",
    Constitution: "Constitution",
    Executions: "Executions",
    Focus: "Term Focus Area",
    Promises: "Promises",
    Negotiations: "Negotiations",
    Nationalization: "Nationalization",
    Education: "Education Budget",
    Healthcare: "Healthcare Budget",
    Military: "Military Budget",
    Security: "Security Budget",
    Diplomacy: "Diplomatic Alignment",
    Immigration: "Immigration Policy",
    Focus: "Term Focus Area",
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
    "Page_SummersInRizia": "Summers in Rizia",
    "Page_TakePower": "Taking Power",
    "Page_University": "University Life",
    "Page_YouthOrganization": "Youth Organization Involvement"
  };
  return map[sub] || sub;
}

function createPanelCard(opt) {
  if (opt.focusBundle && Array.isArray(opt.options)) {
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
    sectionSpan.textContent = opt.section;
    meta.appendChild(sectionSpan);
    const groupSpan = document.createElement("span");
    groupSpan.className = "tag";
    groupSpan.textContent = "Focus";
    meta.appendChild(groupSpan);
    const gameSpan = document.createElement("span");
    gameSpan.className = "tag tag--game";
    gameSpan.textContent = opt.game === "RiziaDLC" ? "Rizia DLC" : "Base game";
    meta.appendChild(gameSpan);
    header.appendChild(h3);
    header.appendChild(meta);
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body";
    opt.options.forEach((o) => {
      const block = document.createElement("div");
      block.className = "card-section focus-option";
      const title = document.createElement("div");
      title.className = "card-section-title";
      title.textContent = o.title || "(option)";
      block.appendChild(title);
      if (o.effects && o.effects.length) {
        const list = document.createElement("ul");
        list.className = "effect-list";
        o.effects.forEach((e) => {
          const li = document.createElement("li");
          li.textContent = e;
          list.appendChild(li);
        });
        block.appendChild(list);
      }
      body.appendChild(block);
    });
    card.appendChild(body);
    return card;
  }

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
  sectionSpan.textContent =
    opt.section === "Prologue" ? "Prologue" : prettifyCategory(opt.section);
  meta.appendChild(sectionSpan);

  if (opt.panelGroup) {
    const panelSpan = document.createElement("span");
    panelSpan.className = "tag";
    if (opt.panelGroup === "Prologue Skip") {
      panelSpan.textContent = "Prologue";
    } else {
      const group = opt.panelGroup.replace(/ Panel$/, "");
      const sub = opt.panelSub;
      panelSpan.textContent = [group, sub].filter(Boolean).join(" — ");
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

  if ((opt.panelGroup || "").toLowerCase().includes("execution") && opt.panelSub) {
    const execLabel = document.createElement("div");
    execLabel.className = "card-pill exec-pill";
    execLabel.textContent =
      opt.panelSub.toLowerCase().includes("method") ? "Execution method" : "Execution target";
    body.appendChild(execLabel);
  }

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
  card.appendChild(body);
  return card;
}

async function initPanelsPage() {
  allPanelOptions = await loadPanelsFromEntityAsset();

  // Bundle focus options (multiple options under one focus prompt)
  allPanelOptions = bundleFocusOptions(allPanelOptions);

  // Deduplicate by title/sub, but keep focus bundles intact
  const unique = new Map();
  for (const opt of allPanelOptions) {
    const key = opt.focusBundle
      ? `focus-${opt.panelSub}-${opt.game}`
      : `${opt.title}-${opt.panelSub}-${opt.game}`;
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

  if (searchInput) searchInput.addEventListener("input", () => renderPanels());
  if (sectionSelect) sectionSelect.addEventListener("change", () => renderPanels());
  if (gameSelect) gameSelect.addEventListener("change", () => renderPanels());
  if (groupingSelect) groupingSelect.addEventListener("change", () => renderPanels());

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
    list.forEach((opt) => {
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
    const list =
      lastPanelFiltered && lastPanelFiltered.length ? lastPanelFiltered : allPanelOptions;
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
  document.addEventListener("click", (e) => {
    if (!exportMenu || exportMenu.hidden) return;
    const t = e.target;
    if (t === exportMenu || t === exportBtn || exportMenu.contains(t) || exportBtn.contains(t))
      return;
    toggleExport(false);
  });

  renderPanels();
}

document.addEventListener("DOMContentLoaded", initPanelsPage);

// Helper to load JSON blocks from Entity Text Asset
async function loadPanelsFromEntityAsset() {
  const paths = ["../data/Entity%20Text%20Asset.txt", "../data/Entity Text Asset.txt"];
  for (const p of paths) {
    try {
      const raw = await fetch(p).then((r) => r.text());
      const blocks = extractDataBlocks(raw);
      if (!blocks) continue;
      const multiRaw =
        blocks.MultipleChoiceOptionDataJson ||
        blocks.MultipleChoiceOptionData ||
        blocks.MultipleChoiceOption ||
        null;
      const carouselRaw =
        blocks.CarouselChoiceOptionDataJson ||
        blocks.CarouselChoiceOptionData ||
        blocks.CarouselChoiceOption ||
        null;
      const multi = multiRaw ? JSON.parse(multiRaw) : null;
      const carousel = carouselRaw ? JSON.parse(carouselRaw) : null;
      const items = [
        ...normalizeItems((multi && multi.items) || [], "multiple"),
        ...normalizeItems((carousel && carousel.items) || [], "carousel")
      ];
      if (items.length) return items;
    } catch (e) {
      console.warn("[Panels] Failed to load from", p, e);
    }
  }
  console.warn("[Panels] No panel data found in Entity Text Asset.");
  return [];
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
    const trimmed = slice.lastIndexOf('"') >= 0 ? slice.substring(0, slice.lastIndexOf('"')) : slice;
    blocks[cur.name] = trimmed.trim();
  }
  return blocks;
}

function bundleFocusOptions(options) {
  const focus = options.filter((o) => (o.panelGroup || "").toLowerCase() === "focus panel");
  if (!focus.length) return options;

  const bundles = new Map();
  for (const o of focus) {
    const sub = resolveFocusSub(o);
    // Normalize original option for downstream grouping (even though we drop originals)
    o.panelSub = sub;
    o.panelGroup = "Focus Panel";
    o.section = "Focus";

    const key = `${sub}-${o.game}`;
    if (!bundles.has(key)) {
      bundles.set(key, {
        id: `focus-${key}`,
        nameInDb: o.nameInDb,
        path: o.path,
        game: o.game,
        section: "Focus",
        panelGroup: "Focus Panel",
        panelSub: sub,
        title: `Focus: ${prettifyCategory(sub)}`,
        focusBundle: true,
        options: [],
      });
    }
    bundles.get(key).options.push({
      title: o.title,
      effects: o.effects,
      condition: o.condition
    });
  }

  const nonFocus = options.filter((o) => (o.panelGroup || "").toLowerCase() !== "focus panel");
  return [...nonFocus, ...bundles.values()];
}

function resolveFocusSub(opt) {
  if (opt.panelSub) return opt.panelSub;
  // try path segment after "Focus Panel"
  if (opt.path) {
    const parts = opt.path.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p.toLowerCase().includes("focus panel"));
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  }
  // try NameInDatabase pattern: TurnXX_FocusPanel_<Sub>_...
  if (opt.nameInDb) {
    const m = opt.nameInDb.match(/FocusPanel_([^_]+)/i);
    if (m && m[1]) return m[1];
  }
  return "General";
}
