// News & Reports loader

document.addEventListener("DOMContentLoaded", () => {
  initNewsPage().catch(err => {
    console.error("News page init failed:", err);
    const info = document.getElementById("nrCountInfo");
    if (info) info.textContent = "Failed to load news & reports.";
  });
});

let nrAllItems = [];
let nrFiltered = [];

async function initNewsPage() {
  nrAllItems = await loadNewsAndReports();
  nrFiltered = nrAllItems.slice();

  // Populate filters
  const turnSelect = document.getElementById("nrTurnFilter");
  const catSelect = document.getElementById("nrCategoryFilter");
  const gameSelect = document.getElementById("nrGameFilter");
  const typeSelect = document.getElementById("nrTypeFilter");
  const searchInput = document.getElementById("nrSearchInput");

  const turns = Array.from(new Set(nrAllItems.map(i => i.turn).filter(v => v !== null))).sort((a, b) => a - b);
  turns.forEach(t => {
    const o = document.createElement("option");
    o.value = String(t);
    o.textContent = `Turn ${t}`;
    turnSelect?.appendChild(o);
  });

  const categories = Array.from(new Set(nrAllItems.map(i => i.category).filter(Boolean))).sort();
  categories.forEach(c => {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = c;
    catSelect?.appendChild(o);
  });

  searchInput?.addEventListener("input", applyFilters);
  typeSelect?.addEventListener("change", applyFilters);
  gameSelect?.addEventListener("change", applyFilters);
  turnSelect?.addEventListener("change", applyFilters);
  catSelect?.addEventListener("change", applyFilters);

  renderList();
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

async function loadNewsAndReports() {
  const paths = ["../data/Entity%20Text%20Asset.txt", "../data/Entity Text Asset.txt"];
  for (const p of paths) {
    try {
      const raw = await fetch(p).then(r => r.text());
      const blocks = extractDataBlocks(raw);
      if (!blocks) continue;

      const items = [];

      if (blocks.News) {
        const parsed = JSON.parse(blocks.News);
        const list = parsed?.items || [];
        list.forEach(item => items.push(normalizeNews(item)));
      }
      if (blocks.Reports) {
        const parsed = JSON.parse(blocks.Reports);
        const list = parsed?.items || [];
        list.forEach(item => items.push(normalizeReport(item)));
      }

      if (items.length) return items.filter(Boolean);
    } catch (e) {
      console.warn("[News] Failed to load from", p, e);
    }
  }
  throw new Error("No News/Reports data found in Entity Text Asset.");
}

function normalizeCommon(item) {
  if (!item) return null;
  const path = item.Path || "";
  const game = path.startsWith("Rizia/") ? "RiziaDLC" : "Base";
  return { path, game, nameInDb: item.NameInDatabase || "", tags: (item.TagsProperties?.Tags || "").split(",").filter(Boolean) };
}

function normalizeNews(item) {
  const base = normalizeCommon(item);
  if (!base) return null;
  const props = item.NewsProperties || {};
  return {
    ...base,
    id: item.Id || "",
    type: "News",
    title: props.Title || "(Untitled news)",
    description: props.Description || "",
    turn: Number.isFinite(props.TurnNo) ? props.TurnNo : null,
    category: deriveCategory(base.path),
    newspaper: props.Newspaper || "",
    condition: props.IsEnabledVariable || "",
  };
}

function normalizeReport(item) {
  const base = normalizeCommon(item);
  if (!base) return null;
  const props = item.ReportProperties || {};
  return {
    ...base,
    id: item.Id || "",
    type: "Report",
    title: props.Title || "(Untitled report)",
    description: props.Description || "",
    turn: Number.isFinite(props.TurnNo) ? props.TurnNo : null,
    category: deriveCategory(base.path),
    condition: props.IsEnabledVariable || "",
    token: item.AssignedTokenProperties?.AssignedToken || "",
  };
}

function deriveCategory(path) {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 3) return parts.slice(2).join(" / ");
  if (parts.length >= 2) return parts[1];
  return "";
}

function applyFilters() {
  const search = (document.getElementById("nrSearchInput")?.value || "").toLowerCase().trim();
  const type = document.getElementById("nrTypeFilter")?.value || "";
  const game = document.getElementById("nrGameFilter")?.value || "";
  const turn = document.getElementById("nrTurnFilter")?.value || "";
    const cat = document.getElementById("nrCategoryFilter")?.value || "";

    nrFiltered = nrAllItems.filter((item) => {
    if (type && item.type !== type) return false;
    if (game && item.game !== game) return false;
    if (turn) {
      const tNum = Number(turn);
      if (item.turn !== tNum) return false;
    }
    if (cat && item.category !== cat) return false;
    if (!search) return true;
      const hay = [
        item.title,
        item.description,
        item.nameInDb,
        item.path,
        item.condition,
        item.newspaper,
        item.token,
        ...(item.tags || []),
      ]
      .join(" ")
      .toLowerCase();
    return hay.includes(search);
  });

  renderList();
}

function renderList() {
  const container = document.getElementById("nrResults");
  const info = document.getElementById("nrCountInfo");
  if (!container) return;
  container.innerHTML = "";

  const total = nrAllItems.length;
  const visible = nrFiltered.length;
  if (info) info.textContent = `Showing ${visible} of ${total} entries`;

  const frag = document.createDocumentFragment();
  nrFiltered
    .sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0) || a.title.localeCompare(b.title))
    .forEach((item) => {
      const card = document.createElement("article");
      card.className = "card";

      const header = document.createElement("header");
      header.className = "card-header";

      const title = document.createElement("h3");
      title.className = "card-title";
      title.textContent = item.title;
      header.appendChild(title);

      const subtitle = document.createElement("p");
      subtitle.className = "card-subtitle";
      const turnTxt = item.turn != null ? `Turn ${item.turn}` : "No turn";
      subtitle.textContent = `${item.type} • ${turnTxt}`;
      header.appendChild(subtitle);

      const meta = document.createElement("div");
      meta.className = "card-meta";
      const metaBits = [];
      if (item.game === "RiziaDLC") metaBits.push("Rizia DLC"); else metaBits.push("Base game");
      if (item.category) metaBits.push(item.category);
      if (item.newspaper) metaBits.push(item.newspaper);
      if (item.token) metaBits.push(item.token);
      if (metaBits.length) meta.textContent = metaBits.join(" | ");
      header.appendChild(meta);

      const body = document.createElement("div");
      body.className = "card-body";
      const desc = document.createElement("p");
      desc.textContent = item.description || "(No description)";
      body.appendChild(desc);

      if (item.condition) {
        const cols = document.createElement("div");
        cols.className = "card-columns";

        const condWrap = document.createElement("div");
        condWrap.className = "card-column";
        const h4 = document.createElement("h4");
        h4.className = "card-column-title";
        h4.textContent = "Conditions";
        condWrap.appendChild(h4);
        const ul = document.createElement("ul");
        ul.className = "card-list";
        const li = document.createElement("li");
        li.textContent = item.condition;
        ul.appendChild(li);
        condWrap.appendChild(ul);
        cols.appendChild(condWrap);

        body.appendChild(cols);
      }

      card.appendChild(header);
      card.appendChild(body);
      frag.appendChild(card);
    });

  container.appendChild(frag);
}
