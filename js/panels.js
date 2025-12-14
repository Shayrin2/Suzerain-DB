// panels.js
// Prologue + Decisions/Budget options viewer
// Uses MultipleChoiceOptionData.txt + CarouselChoiceOptionData.txt

let allPanelOptions = [];

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
      option.nameInDb,
      option.path
    ]
      .join(" | ")
      .toLowerCase();

    if (!hay.includes(s)) return false;
  }

  return true;
}

function renderPanels() {
  const container = document.getElementById("panelResults");
  const searchInput = document.getElementById("panelSearchInput");
  const sectionSelect = document.getElementById("panelSectionFilter");
  const gameSelect = document.getElementById("panelGameFilter");
  const countInfo = document.getElementById("panelCountInfo");

  if (!container) return;

  const filters = {
    search: searchInput?.value.trim() || "",
    section: sectionSelect?.value || "",
    game: gameSelect?.value || ""
  };

  const filtered = allPanelOptions.filter((o) => matchesFilters(o, filters));

  container.innerHTML = "";

  if (countInfo) {
    countInfo.textContent = `${filtered.length} option${
      filtered.length === 1 ? "" : "s"
    } shown`;
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

  for (const opt of filtered) {
    const card = document.createElement("article");
    card.className = "card";

    const header = document.createElement("header");
    header.className = "card-header";

    const h3 = document.createElement("h3");
    h3.className = "card-title";
    h3.textContent = opt.title;

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.innerHTML = `
      <span class="tag tag--section">${opt.section === "Prologue" ? "Prologue" : "Decisions &amp; Budget"}</span>
      ${
        opt.panelGroup
          ? `<span class="tag">${opt.panelGroup.replace(/ Panel$/, "")}${
              opt.panelSub ? " – " + opt.panelSub : ""
            }</span>`
          : ""
      }
      <span class="tag tag--game">${
        opt.game === "RiziaDLC" ? "Rizia DLC" : "Base game"
      }</span>
    `;

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

      metaBlock.textContent = pieces.join(" · ");
      body.appendChild(metaBlock);
    }

    card.appendChild(body);
    container.appendChild(card);
  }
}

async function initPanelsPage() {
  // Adjust paths if your files live somewhere else (e.g. "../data/...")
  const [multi, carousel] = await Promise.all([
    loadJson("../data/MultipleChoiceOptionData.txt"),
    loadJson("../data/CarouselChoiceOptionData.txt")
  ]);

  allPanelOptions = [
    ...normalizeItems(multi.items, "multiple"),
    ...normalizeItems(carousel.items, "carousel")
  ];

  // Wire filters
  const searchInput = document.getElementById("panelSearchInput");
  const sectionSelect = document.getElementById("panelSectionFilter");
  const gameSelect = document.getElementById("panelGameFilter");

  if (searchInput)
    searchInput.addEventListener("input", () => renderPanels());
  if (sectionSelect)
    sectionSelect.addEventListener("change", () => renderPanels());
  if (gameSelect)
    gameSelect.addEventListener("change", () => renderPanels());

  renderPanels();
}

document.addEventListener("DOMContentLoaded", initPanelsPage);
