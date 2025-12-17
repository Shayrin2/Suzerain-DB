// js/conversations.js
document.addEventListener("DOMContentLoaded", () => {
  initConversationsPage().catch(err => {
    console.error("Error initializing conversations page", err);
  });
});

async function initConversationsPage() {
  const searchInput = document.getElementById("searchInput");
  const speakerSelect = document.getElementById("speakerFilter");
  const gameSelect = document.getElementById("gameFilter");
  const hideNarrator = document.getElementById("hideNarrator");
  const onlyConsequential = document.getElementById("onlyConsequential");

  const countInfo = document.getElementById("countInfo");
  const listContainer = document.getElementById("results");
  const exportBtn = document.getElementById("exportConversationsBtn");
  const exportMenu = document.getElementById("exportMenu");
  const exportConfirm = document.getElementById("exportConfirm");
  const exportCancel = document.getElementById("exportCancel");
  const exportSpeakerText = document.getElementById("exportSpeakerText");
  const exportConditions = document.getElementById("exportConditions");
  const exportEffects = document.getElementById("exportEffects");
  const exportPosition = document.getElementById("exportPosition");

  const RIZIA_FIRST_CONVERSATION_ID = 287;

  function conversationGameKey(convId) {
    if (convId == null) return "";
    return convId >= RIZIA_FIRST_CONVERSATION_ID ? "RiziaDLC" : "Base";
  }

  function gameLabelFromKey(key) {
    if (key === "RiziaDLC") return "Rizia DLC";
    if (key === "Base") return "Base game";
    return "";
  }

  // Master data
  let conversations = new Map();      // convId -> { choices: Node[] }
  let allNodes = [];                  // all choice nodes
  let totalChoices = 0;

  // Graph helpers
  let nodeByKey = new Map();          // `${convId}:${id}` -> node
  let childrenByKey = new Map();      // `${convId}:${id}` -> [{conversationID,id}]
  let parentsByKey = new Map();       // `${convId}:${id}` -> [{conversationID,id}]

  // Filtered results - which choices are visible in each conversation
  let filteredByConversation = new Map();

  const RENDERED_CARD_FLAG = Symbol("renderedCards");
  let dataReady = false;

  // ---- tiny helpers ----

  function uniqueStrings(list) {
    const seen = new Set();
    const out = [];
    for (const v of list || []) {
      const s = String(v);
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }

  function getAggregatedConditions(node) {
    const key = `${node.conversationID}:${node.id}`;
    const conds = [];

    if (node.conditions && node.conditions.length) {
      conds.push(...node.conditions);
    }

    const parentRefs = parentsByKey.get(key) || [];
    for (const ref of parentRefs) {
      const pk = `${ref.conversationID}:${ref.id}`;
      const parent = nodeByKey.get(pk);
      if (parent && parent.conditions && parent.conditions.length) {
        conds.push(...parent.conditions);
      }
    }

    return uniqueStrings(conds);
  }

  function getAggregatedEffects(node) {
    const key = `${node.conversationID}:${node.id}`;
    const effs = [];

    if (node.effects && node.effects.length) {
      effs.push(...node.effects);
    }

    const childRefs = childrenByKey.get(key) || [];
    for (const ref of childRefs) {
      const ck = `${ref.conversationID}:${ref.id}`;
      const child = nodeByKey.get(ck);
      if (child && child.effects && child.effects.length) {
        effs.push(...child.effects);
      }
    }

    return uniqueStrings(effs);
  }

  function normalizeSpeakerKey(value) {
    return (value || "")
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[()]/g, "")
      .trim();
  }

  function canonicalSpeakerKey(node) {
    const raw =
      node.speaker ||
      node.speakerKey ||
      (node.isPlayerRomus ? "player_romus" : node.isPlayer ? "player" : "");
    const norm = normalizeSpeakerKey(raw);
    if (!norm) return "";
    if (norm.startsWith("player") || norm.startsWith("anton") || norm.startsWith("romus")) {
      return "player";
    }
    if (norm.startsWith("narrator")) return "narrator";
    return norm;
  }

  function speakerLabel(node) {
    return node.speaker || node.speakerKey || "";
  }

  function speakerDisplay(node) {
    const canon = canonicalSpeakerKey(node);
    if (canon === "player") return "Player";
    if (canon === "narrator") return "Narrator";
    return speakerLabel(node) || canon || "Unknown";
  }

  function isStartNode(node) {
    const title = (node.rawTitle || "").trim().toUpperCase();
    const choice = (node.choiceText || "").trim().toUpperCase();
    if (title === "START" || choice === "START") return true;
    if (title === "INPUT" || choice === "INPUT") return true;
    if (title === "OUTPUT" || choice === "OUTPUT") return true;
    return false;
  }

  // ---- build cards lazily ----

  function buildNodeCard(node, gameKey) {
    const title =
      node.choiceText ||
      node.npcText ||
      node.enText ||
      node.rawTitle ||
      `Entry #${node.id ?? "?"}`;
    const subtitle = `${speakerDisplay(node)} — Node ${node.id ?? "?"} in conversation ${node.conversationID ?? "?"}`;

    const metaParts = [];
    const gameLabel = gameLabelFromKey(gameKey);
    if (gameLabel) metaParts.push(gameLabel);
    const meta = metaParts.join(" | ");

    const conditions = getAggregatedConditions(node);
    const effects = getAggregatedEffects(node);

    const card = document.createElement("article");
    card.className = "card";

    const header = document.createElement("header");
    header.className = "card-header";

    const h3 = document.createElement("h3");
    h3.className = "card-title";
    h3.textContent = title;
    header.appendChild(h3);

    const sub = document.createElement("p");
    sub.className = "card-subtitle";
    sub.textContent = subtitle;
    header.appendChild(sub);

    if (meta) {
      const metaSpan = document.createElement("span");
      metaSpan.className = "card-meta";
      const speaker = speakerDisplay(node);
      metaSpan.textContent = speaker ? `${speaker}${meta ? " | " + meta : ""}` : meta;
      header.appendChild(metaSpan);
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const columns = document.createElement("div");
    columns.className = "card-columns";

    function makeList(label, items) {
      if (!items || !items.length) return null;
      const wrap = document.createElement("div");
      wrap.className = "card-column";

      const h4 = document.createElement("h4");
      h4.className = "card-column-title";
      h4.textContent = label;
      wrap.appendChild(h4);

      const ul = document.createElement("ul");
      ul.className = "card-list";
      items.forEach(t => {
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      return wrap;
    }

    const condCol = makeList("Conditions", conditions);
    const effCol = makeList("Effects", effects);

    if (condCol) columns.appendChild(condCol);
    if (effCol) columns.appendChild(effCol);

    body.appendChild(columns);
    card.appendChild(header);
    card.appendChild(body);

    if (node.mutexIds && node.mutexIds.length) {
      const footer = document.createElement("div");
      footer.className = "card-footer";
      footer.textContent = `Mutually exclusive with: ${node.mutexIds.join(", ")}`;
      card.appendChild(footer);
    }

    return card;
  }

  function renderConversationCards(convId, container) {
    // If we've already rendered cards for this conversation, don't do it again
    if (container[RENDERED_CARD_FLAG]) {
      return;
    }
    container[RENDERED_CARD_FLAG] = true;

    const nodes = filteredByConversation.get(convId) || [];
    const gameKey = conversationGameKey(convId);

    const groups = new Map(); // groupKey -> nodes[]
    nodes.forEach(node => {
      const nodeKey = `${convId}:${node.id}`;
      const parentRefs = parentsByKey.get(nodeKey) || [];

      let gk;
      const sameConvParent = parentRefs.find(p => p.conversationID === convId);
      if (sameConvParent) {
        gk = `${sameConvParent.conversationID}:${sameConvParent.id}`;
      } else if (parentRefs[0]) {
        gk = `${parentRefs[0].conversationID}:${parentRefs[0].id}`;
      } else {
        gk = `self:${nodeKey}`;
      }

      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(node);
    });

    // Assign mutex ids inside each group lazily
    for (const groupNodes of groups.values()) {
      if (groupNodes.length <= 1) {
        groupNodes[0].mutexIds = [];
        continue;
      }
      const ids = groupNodes.map(n => n.id);
      for (const n of groupNodes) {
        n.mutexIds = ids.filter(id => id !== n.id);
      }
    }

    const orderedGroups = Array.from(groups.values()).map(groupNodes => ({
      sortId: Math.min(...groupNodes.map(n => n.id ?? 0)),
      nodes: groupNodes.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
    })).sort((a, b) => a.sortId - b.sortId);

      const frag = document.createDocumentFragment();
      orderedGroups.forEach(group => {
        group.nodes.forEach(node => {
          frag.appendChild(buildNodeCard(node, gameKey));
        });
      });

      container.innerHTML = "";
      container.appendChild(frag);
    }

  // ---- data load via worker ----

  countInfo.textContent = "Loading conversations...";

  const worker = new Worker("../js/conversationsWorker.js");
  worker.addEventListener("message", ev => {
    const msg = ev.data || {};
    if (msg.type === "progress") {
      const pct = msg.total
        ? Math.min(100, Math.round((msg.received / msg.total) * 100))
        : null;
      if (pct != null) {
        countInfo.textContent = `Loading conversations... ${pct}%`;
      } else if (msg.received) {
        const mb = Math.round(msg.received / 1024 / 1024);
        countInfo.textContent = `Loading conversations... (${mb} MB)`;
      }
      return;
    }
    if (msg.type === "parse-progress") {
      const pct = msg.total
        ? Math.min(100, Math.round((msg.processed / msg.total) * 100))
        : null;
      if (pct != null) {
        countInfo.textContent = `Building conversations... ${pct}%`;
      } else {
        countInfo.textContent = "Building conversations...";
      }
      return;
    }
    if (msg.type === "error") {
      console.error("Conversation worker error:", msg.error);
      countInfo.textContent = "Failed to load conversations.";
      return;
    }
    if (msg.type !== "data") return;

    const { nodes, links, choices } = msg;

    const nodesLocal = Array.isArray(nodes) ? nodes : [];
    const linksLocal = Array.isArray(links) ? links : [];

    // Use all nodes (not just choices) so speaker filtering covers every actor
    allNodes = nodesLocal;

    nodeByKey = new Map();
    for (const n of nodesLocal) {
      if (n.conversationID == null || n.id == null) continue;
      nodeByKey.set(`${n.conversationID}:${n.id}`, n);
    }

    childrenByKey = new Map();
    parentsByKey = new Map();

    for (const link of linksLocal) {
      const originKey = `${link.originConversationID}:${link.originDialogueID}`;
      const destKey = `${link.destinationConversationID}:${link.destinationDialogueID}`;

      const childRef = {
        conversationID: link.destinationConversationID,
        id: link.destinationDialogueID,
      };
      if (!childrenByKey.has(originKey)) {
        childrenByKey.set(originKey, []);
      }
      childrenByKey.get(originKey).push(childRef);

      const parentRef = {
        conversationID: link.originConversationID,
        id: link.originDialogueID,
      };
      if (!parentsByKey.has(destKey)) {
        parentsByKey.set(destKey, []);
      }
      parentsByKey.get(destKey).push(parentRef);
    }

    // Group choices by conversationID (skip START nodes)
    conversations = new Map();
    allNodes.forEach(node => {
      if (isStartNode(node)) return;
      const convId = node.conversationID;
      if (convId == null) return;
      let bucket = conversations.get(convId);
      if (!bucket) {
        bucket = { choices: [] };
        conversations.set(convId, bucket);
      }
      bucket.choices.push(node);
    });

    // Mark consequential choices
    for (const [convId, bucket] of conversations.entries()) {
      bucket.choices.forEach(node => {
        const key = `${convId}:${node.id}`;
        const hasSelf = !!node._hasMechanics;
        let hasChild = false;

        const childRefs = childrenByKey.get(key) || [];
        for (const ref of childRefs) {
          const ck = `${ref.conversationID}:${ref.id}`;
          const child = nodeByKey.get(ck);
          if (child && child._hasMechanics) {
            hasChild = true;
            break;
          }
        }

        node.isConsequential = hasSelf || hasChild;
      });
    }

    totalChoices = allNodes.filter(n => !isStartNode(n)).length;

    // Build speaker options
    if (speakerSelect) {
      const speakers = new Map(); // canonicalKey -> label
      allNodes.forEach(n => {
        const canon = canonicalSpeakerKey(n);
        const label = speakerLabel(n);
        const fallbackLabel = label || canon;
        if (!fallbackLabel) return;
        if (canon === "player" || canon === "narrator") return; // handled by Player option
        if (!speakers.has(canon)) {
          speakers.set(canon, fallbackLabel);
        }
      });

      const sorted = Array.from(speakers.entries()).sort((a, b) =>
        String(a[1]).localeCompare(String(b[1]), undefined, { sensitivity: "base" })
      );

      speakerSelect.innerHTML = "";

      const makeOpt = (value, label, selected) => {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        if (selected) o.selected = true;
        return o;
      };

      speakerSelect.appendChild(makeOpt("__player", "Player", true));
      speakerSelect.appendChild(makeOpt("", "(All speakers)", false));

      sorted.forEach(([key, label]) => {
        speakerSelect.appendChild(makeOpt(key, label, false));
      });
    }

    dataReady = true;
    applyFilters();
  });

  worker.addEventListener("error", err => {
    console.error("Conversation worker crashed:", err);
    countInfo.textContent = "Failed to load conversations.";
  });

  worker.postMessage({ type: "load" });

  // ---- filtering & shell rendering ----

  function applyFilters() {
    if (!dataReady) {
      countInfo.textContent = "Loading conversations...";
      return;
    }

    const q = searchInput.value.trim();
    const speakerValue = speakerSelect ? speakerSelect.value : "";
    const gameFilter = gameSelect.value; // "RiziaDLC" / "Base" / ""
    const hideNarratorChecked = !!hideNarrator.checked;
    const consequentialOnly = !!onlyConsequential.checked;

    const hasTextSearch = q.length > 0;

    filteredByConversation = new Map();
    let visibleChoices = 0;

    for (const [convIdRaw, bucket] of conversations.entries()) {
      const convId = Number(convIdRaw);
      const convGameKey = conversationGameKey(convId);

      if (gameFilter && convGameKey !== gameFilter) continue;

      const baseChoices = bucket.choices;
      if (!baseChoices || !baseChoices.length) continue;

      const filteredNodes = baseChoices.filter(node => {
        if (isStartNode(node)) return false;
        const nodeSpeakerKey = canonicalSpeakerKey(node);

        if (hideNarratorChecked && nodeSpeakerKey === "narrator") return false;
        if (consequentialOnly && !node.isConsequential) return false;

        if (speakerValue === "__player") {
          const isPlayerish =
            nodeSpeakerKey === "player" ||
            nodeSpeakerKey === "narrator";
          if (!isPlayerish) return false;
        } else if (speakerValue) {
          if (nodeSpeakerKey !== speakerValue) return false;
        }

        if (!hasTextSearch) return true;

        // Only run expensive text search when q is non-empty
        return FilterUtils.textMatch(node, q, [
          "choiceText",
          "npcText",
          "conditions",
          "effects",
        ]);
      });

      if (filteredNodes.length > 0) {
        filteredByConversation.set(convId, filteredNodes);
        visibleChoices += filteredNodes.length;
      }
    }

    // Update counts
    countInfo.textContent = `Showing ${visibleChoices} of ${totalChoices} choices`;

    // Build / update conversation shells (headers only)
    listContainer.innerHTML = "";
    const sortedConvIds = Array.from(filteredByConversation.keys()).sort(
      (a, b) => a - b
    );

    sortedConvIds.forEach(convId => {
      const nodes = filteredByConversation.get(convId);

      const convDetails = document.createElement("details");
      convDetails.className = "panel";
      convDetails.open = false;
      convDetails.dataset.convId = String(convId);

      const summary = document.createElement("summary");
      summary.className = "panel-title";
      summary.textContent = `Conversation ${convId}`;

      const metaSpan = document.createElement("span");
      metaSpan.className = "panel-meta";
      metaSpan.textContent = `${nodes.length} choices`;
      summary.appendChild(metaSpan);

      convDetails.appendChild(summary);

      const cardsDiv = document.createElement("div");
      cardsDiv.className = "cards-container conv-cards";
      cardsDiv.dataset.convId = String(convId);
      convDetails.appendChild(cardsDiv);

      convDetails.addEventListener("toggle", () => {
        if (convDetails.open) {
          renderConversationCards(convId, cardsDiv);
        }
      });

      listContainer.appendChild(convDetails);
    });
  }

  // Hook filters
  searchInput.addEventListener("input", applyFilters);
  speakerSelect.addEventListener("change", applyFilters);
  gameSelect.addEventListener("change", applyFilters);
  hideNarrator.addEventListener("change", applyFilters);
  onlyConsequential.addEventListener("change", applyFilters);

  function toggleExportMenu(show) {
    if (!exportMenu) return;
    exportMenu.hidden = !show;
  }

  function buildExportText(options) {
    const lines = [];
    const sortedConvIds = Array.from(filteredByConversation.keys()).sort((a, b) => a - b);

    sortedConvIds.forEach(convId => {
      lines.push(`Conversation ${convId}`);
      const nodes = filteredByConversation.get(convId) || [];

      nodes.forEach(node => {
        const row = [];
        if (options.speakerText) {
          const text =
            node.choiceText ||
            node.enText ||
            node.npcText ||
            node.rawTitle ||
            "";
          row.push(`- ${speakerDisplay(node)}: ${text}`.trim());
        }
        if (options.position) {
          row.push(`(Node ${node.id ?? "?"} in conversation ${node.conversationID ?? "?"})`);
        }
        if (row.length) lines.push(row.join(" "));

        if (options.conditions) {
          const conds = getAggregatedConditions(node);
          if (conds && conds.length) {
            lines.push(`  Conditions: ${conds.join(" | ")}`);
          }
        }
        if (options.effects) {
          const effs = getAggregatedEffects(node);
          if (effs && effs.length) {
            lines.push(`  Effects: ${effs.join(" | ")}`);
          }
        }
      });

      lines.push(""); // blank line between conversations
    });

    return lines.join("\n");
  }

  function handleExport() {
    const opts = {
      speakerText: exportSpeakerText?.checked !== false,
      conditions: exportConditions?.checked !== false,
      effects: exportEffects?.checked !== false,
      position: exportPosition?.checked !== false,
    };

    const content = buildExportText(opts);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conversations_export.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toggleExportMenu(false);
  }

  if (exportBtn) exportBtn.addEventListener("click", () => toggleExportMenu(exportMenu?.hidden));
  if (exportCancel) exportCancel.addEventListener("click", () => toggleExportMenu(false));
  if (exportConfirm) exportConfirm.addEventListener("click", handleExport);

  document.addEventListener("click", (e) => {
    if (!exportMenu || exportMenu.hidden) return;
    const target = e.target;
    if (target === exportMenu || target === exportBtn || exportMenu.contains(target) || exportBtn.contains(target)) {
      return;
    }
    toggleExportMenu(false);
  });
}
