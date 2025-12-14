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
  const onlyPlayerRomus = document.getElementById("onlyPlayerRomus");
  const onlyConsequential = document.getElementById("onlyConsequential");

  const countInfo = document.getElementById("countInfo");
  const summarySpan = document.getElementById("conversationSummaryCount");
  const listContainer = document.getElementById("results");

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

  // Filtered results – which choices are visible in each conversation
  let filteredByConversation = new Map();

  const RENDERED_CARD_FLAG = Symbol("renderedCards");

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

  // ---- build cards lazily ----

  function buildNodeCard(node, gameKey) {
    const title = node.choiceText || `Choice #${node.id ?? "?"}`;
    const subtitle = `Node ${node.id ?? "?"} in conversation ${node.conversationID ?? "?"}`;

    const metaParts = [];
    const gameLabel = gameLabelFromKey(gameKey);
    if (gameLabel) metaParts.push(gameLabel);
    const meta = metaParts.join(" · ");

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
      metaSpan.textContent = meta;
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
      const gk = node.groupKey || `self:${convId}:${node.id}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(node);
    });

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

  // ---- parse + build data once ----

  countInfo.textContent = "Loading conversations…";

  const raw = await DataLoader.loadText("../data/Suzerain.txt");
  const parsed = SuzerainParser.parseSuzerain(raw);

  const nodes = parsed.nodes || [];
  const links = parsed.links || [];
  allNodes = parsed.choices || [];

  nodeByKey = new Map();
  for (const n of nodes) {
    if (n.conversationID == null || n.id == null) continue;
    nodeByKey.set(`${n.conversationID}:${n.id}`, n);
  }

  childrenByKey = new Map();
  parentsByKey = new Map();

  for (const link of links) {
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

  // Group choices by conversationID
  conversations = new Map();
  allNodes.forEach(node => {
    const convId = node.conversationID;
    if (convId == null) return;
    let bucket = conversations.get(convId);
    if (!bucket) {
      bucket = { choices: [] };
      conversations.set(convId, bucket);
    }
    bucket.choices.push(node);
  });

  // Build groups/mutex sets inside each conversation
  for (const [convIdRaw, bucket] of conversations.entries()) {
    const convId = Number(convIdRaw);
    const groups = new Map(); // groupKey -> [nodes]

    bucket.choices.forEach(node => {
      const nodeKey = `${convId}:${node.id}`;
      const parentRefs = parentsByKey.get(nodeKey) || [];

      let groupKey;
      const sameConvParent = parentRefs.find(p => p.conversationID === convId);
      if (sameConvParent) {
        groupKey = `${sameConvParent.conversationID}:${sameConvParent.id}`;
      } else if (parentRefs[0]) {
        groupKey = `${parentRefs[0].conversationID}:${parentRefs[0].id}`;
      } else {
        groupKey = `self:${nodeKey}`;
      }

      node.groupKey = groupKey;

      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(node);
    });

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

    const grouped = Array.from(
      groups.values(),
      nodesInGroup => ({
        sortId: Math.min(...nodesInGroup.map(n => n.id ?? 0)),
        nodes: nodesInGroup.sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
      })
    ).sort((a, b) => a.sortId - b.sortId);

    bucket.choices = grouped.flatMap(g => g.nodes);
  }

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

  totalChoices = Array.from(conversations.values()).reduce(
    (sum, b) => sum + b.choices.length,
    0
  );

  // ---- filtering & shell rendering ----

  function applyFilters() {
    const q = searchInput.value.trim();
    const speakerValue = speakerSelect.value;
    const gameFilter = gameSelect.value; // "RiziaDLC" / "Base" / ""
    const romusOnly = !!onlyPlayerRomus.checked;
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
        if (romusOnly && !node.isPlayerRomus) return false;
        if (consequentialOnly && !node.isConsequential) return false;

        if (speakerValue) {
          // Speaker filtering hook if you ever want it
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
    if (totalChoices === 0) {
      countInfo.textContent = "No choices found";
    } else if (visibleChoices === totalChoices) {
      countInfo.textContent = `${visibleChoices} choices`;
    } else {
      countInfo.textContent = `${visibleChoices} / ${totalChoices} choices`;
    }

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

    const visibleConversations = sortedConvIds.length;
    if (summarySpan) {
      summarySpan.textContent = String(visibleConversations);
    }
  }

  // Hook filters
  searchInput.addEventListener("input", applyFilters);
  speakerSelect.addEventListener("change", applyFilters);
  gameSelect.addEventListener("change", applyFilters);
  onlyPlayerRomus.addEventListener("change", applyFilters);
  onlyConsequential.addEventListener("change", applyFilters);

  // Initial render
  applyFilters();
}
