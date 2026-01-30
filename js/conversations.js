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
  const hideMechanics = document.getElementById("hideMechanics");

  const countInfo = document.getElementById("countInfo");
  const listContainer = document.getElementById("results");
  const exportBtn = document.getElementById("exportConversationsBtn");
  const exportMenu = document.getElementById("exportMenu");
  const exportConfirm = document.getElementById("exportConfirm");
  const exportCancel = document.getElementById("exportCancel");
  const exportConditions = document.getElementById("exportConditions");
  const exportEffects = document.getElementById("exportEffects");
  const exportPosition = document.getElementById("exportPosition");
  const exportMutex = document.getElementById("exportMutex");

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
  const PARSED_CACHE_KEY = "parsed:conversations";
  const RAW_CACHE_KEYS = [
    "preload:../data/Suzerain.txt",
    "preload:data/Suzerain.txt",
    "preload:../data/suzerain.txt",
    "preload:data/suzerain.txt",
    "preload:./data/Suzerain.txt",
    "preload:./data/suzerain.txt",
    "preload:/data/Suzerain.txt",
    "preload:/data/suzerain.txt"
  ];
  const storage = (() => {
    try {
      return window.top?.sessionStorage || sessionStorage;
    } catch (e) {
      return sessionStorage;
    }
  })();

  // Graph helpers
  let nodeByKey = new Map();          // `${convId}:${id}` -> node
  let childrenByKey = new Map();      // `${convId}:${id}` -> [{conversationID,id}]
  let parentsByKey = new Map();       // `${convId}:${id}` -> [{conversationID,id}]

  // Filtered results - which choices are visible in each conversation
  let filteredByConversation = new Map();

  const RENDERED_CARD_FLAG = Symbol("renderedCards");
  let dataReady = false;
  let filterToken = 0;

  function isMechanicsOnlyNode(node) {
    const menu = normalizeMenuText(node.menuText) || "";
    const spoken = (node.enText || node.npcText || "").trim();
    const raw = (node.rawTitle || "").trim();
    const choice = (node.choiceText || "").trim();
    const primaryText = menu || choice || spoken || raw;
    const effectsText = (node.effects || []).join("; ").trim();
    const conditionsText = (node.conditions || []).join("; ").trim();

    const commandLike = (s) => {
      if (!s) return false;
      const lower = s.trim().toLowerCase();
      return (
        lower.startsWith("end()") ||
        lower === "end" ||
        lower.startsWith("jump to:") ||
        lower.startsWith("//") ||
        lower.startsWith("advancetimeline") ||
        lower.startsWith("lookatmodeoff") ||
        lower.startsWith("dontplaymapmusic") ||
        lower.startsWith("dontplaymapambience") ||
        lower.startsWith("addconversant") ||
        lower.startsWith("removeconversant") ||
        lower.startsWith("playsoundeffect") ||
        lower.startsWith("playloopedmusic") ||
        lower.startsWith("playloopedmusicfancy") ||
        lower.startsWith("stopmusic") ||
        lower.startsWith("startcamera") ||
        lower.startsWith("stopcamera") ||
        lower.startsWith("fade") ||
        lower.startsWith("cutscreen") ||
        lower.startsWith("basegame.") ||
        lower.startsWith("riziadlc.")
      );
    };

    if (commandLike(raw) || commandLike(choice) || commandLike(spoken)) return true;

    // If there's no readable text at all but mechanics exist
    if (!menu && !spoken && !choice && node._hasMechanics) return true;

    // If text looks like a pure expression (variable compare) with no spoken/menu text
    const exprRe = /^!?[A-Za-z0-9_.\[\]"']+\s*(==|=|<=|>=|!=|<|>)/;
    const exprReLoose = /(==|!=|<=|>=|=|<|>|Variable\[)/;
    const startsWithDomain = (txt) => {
      const t = (txt || "").trim().toLowerCase();
      return t.startsWith("basegame.") || t.startsWith("riziadlc.");
    };
    if (!spoken && !menu) {
      if (choice && (exprRe.test(choice) || startsWithDomain(choice) || (choice.startsWith("(") && exprReLoose.test(choice)))) return true;
      if (!choice && raw && (exprRe.test(raw) || startsWithDomain(raw) || (raw.startsWith("(") && exprReLoose.test(raw)))) return true;
    }

    // No visible text, only mechanics
    if (!primaryText) return !!effectsText || !!conditionsText;

    // If text looks like a pure expression and we have mechanics, drop it
    const looksLikeExpression =
      !spoken &&
      !menu &&
      /\b(==|!=|>=|<=|=)\b/.test(primaryText) &&
      (node.conditions?.length || node.effects?.length);
    if (looksLikeExpression) return true;

    // If text matches the effects/conditions blob, drop it
    const norm = (s) => s.replace(/;\s*/g, " ").trim().toLowerCase();
    const pNorm = norm(primaryText);
    const eNorm = norm(effectsText);
    const cNorm = norm(conditionsText);
    if (eNorm && (pNorm === eNorm || pNorm.includes(eNorm) || eNorm.includes(pNorm))) return true;
    if (cNorm && (pNorm === cNorm || pNorm.includes(cNorm) || cNorm.includes(pNorm))) return true;

    return false;
  }

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

  function normalizeMenuText(raw) {
    if (!raw) return "";
    let t = String(raw).trim();
    while (t.length > 1 && t.startsWith('"') && t.endsWith('"')) {
      t = t.slice(1, -1).trim();
    }
    return t;
  }

  function normalizeForCompare(raw) {
    return (raw || "")
      .replace(/^"+|"+$/g, "")
      .trim()
      .toLowerCase();
  }

  // ---- build cards lazily ----

  function buildNodeCard(node, gameKey) {
    const menuText = normalizeMenuText(node.menuText);
    const spokenText = (node.enText || node.npcText || "").trim();
    const effectsText = (node.effects || []).join("; ").trim();
    const primaryText =
      menuText ||
      node.choiceText ||
      spokenText ||
      (node.rawTitle || "").trim();
    const hasMeaningfulText = primaryText && primaryText.trim();
    // Drop mechanics-only consequence nodes whose visible text is just the effects string
    if (!hasMeaningfulText) return null;
    if (effectsText) {
      const p = primaryText.trim();
      const e = effectsText.trim();
      const normalizedEffects = e.replace(/;\\s*/g, " ");
      const looksLikeEffects =
        p === e ||
        p === normalizedEffects ||
        normalizedEffects.includes(p) ||
        p.includes(normalizedEffects);
      if (looksLikeEffects) return null;
    }

    const isPlayerChoice = canonicalSpeakerKey(node) === "player";
    const title =
      menuText ||
      node.choiceText ||
      spokenText ||
      node.rawTitle ||
      `Entry #${node.id ?? "?"}`;
    const subtitle = `${speakerDisplay(node)} - Node ${node.id ?? "?"} in conversation ${node.conversationID ?? "?"}`;

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

    const spokenDiffers =
      spokenText &&
      normalizeForCompare(spokenText) !== normalizeForCompare(menuText);

    if (isPlayerChoice && spokenDiffers) {
      const spoken = document.createElement("p");
      spoken.className = "card-subline";
      spoken.textContent = spokenText;
      header.appendChild(spoken);
    }

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
          const card = buildNodeCard(node, gameKey);
          if (card) frag.appendChild(card);
        });
      });

      container.innerHTML = "";
      container.appendChild(frag);
    }

  // ---- data load via worker or cache ----

  countInfo.textContent = "Loading conversations...";

  function persistParsed(payload) {
    try {
      storage.setItem(PARSED_CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
      // ignore quota errors
    }
  }

  async function processData(msg) {
    const { nodes, links } = msg || {};
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
    await applyFilters();
    // Notify parent (preload overlay) that conversations are ready
    try {
      window.parent?.postMessage({ type: "conv-ready" }, "*");
    } catch (e) {
      // ignore
    }
  }

  async function loadData() {
    // 1) Try parsed cache
    try {
      const cached = storage.getItem(PARSED_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        processData(parsed);
        countInfo.textContent = "Conversations ready (cached)";
        return;
      }
    } catch (e) {
      // ignore parse errors, fall back to worker
    }

    // 2) Use worker (with preloaded text when available)
    const worker = new Worker("../js/conversationsWorker.js");

    worker.addEventListener("message", ev => {
      const msg = ev.data || {};
    if (msg.type === "progress") {
      const pct = msg.total
        ? Math.min(100, Math.round((msg.received / msg.total) * 100))
        : null;
      if (pct != null) {
        countInfo.textContent = `Loading conversations... ${pct}%`;
        window.parent?.postMessage({ type: "conv-progress", phase: "load", pct, label: countInfo.textContent }, "*");
      } else if (msg.received) {
        const mb = Math.round(msg.received / 1024 / 1024);
        countInfo.textContent = `Loading conversations... (${mb} MB)`;
        window.parent?.postMessage({ type: "conv-progress", phase: "load", pct: null, label: countInfo.textContent }, "*");
      }
      return;
    }
    if (msg.type === "parse-progress") {
      const pct = msg.total
        ? Math.min(100, Math.round((msg.processed / msg.total) * 100))
        : null;
      if (pct != null) {
        countInfo.textContent = `Building conversations... ${pct}%`;
        window.parent?.postMessage({ type: "conv-progress", phase: "parse", pct, label: countInfo.textContent }, "*");
      } else {
        countInfo.textContent = "Building conversations...";
        window.parent?.postMessage({ type: "conv-progress", phase: "parse", pct: null, label: countInfo.textContent }, "*");
      }
      return;
    }
    if (msg.type === "error") {
      console.error("Conversation worker error:", msg.error);
      countInfo.textContent = "Failed to load conversations.";
      window.parent?.postMessage({ type: "conv-progress", phase: "error", label: countInfo.textContent }, "*");
      return;
    }
    if (msg.type !== "data") return;

      persistParsed({ nodes: msg.nodes || [], links: msg.links || [], choices: msg.choices || [] });
      processData(msg).catch(err => {
        console.error("Failed to process conversations data", err);
        countInfo.textContent = "Failed to load conversations.";
      });
    });

    worker.addEventListener("error", err => {
      console.error("Conversation worker crashed:", err);
      countInfo.textContent = "Failed to load conversations.";
    });

    // Prefer preloaded raw text to avoid refetching
    let raw = null;
    for (const key of RAW_CACHE_KEYS) {
      try {
        const val = storage.getItem(key);
        if (val) {
          raw = val;
          break;
        }
      } catch (e) {
        // ignore storage errors
      }
    }

    // Post the message immediately so we see progress events early
    if (raw) {
      worker.postMessage({ type: "parseText", text: raw });
    } else {
      worker.postMessage({ type: "load" });
    }
  }

  loadData();

  // ---- filtering & shell rendering ----

  async function applyFilters() {
    const myToken = ++filterToken;
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

    const entries = Array.from(conversations.entries());
    const totalConv = entries.length || 1;
    // Hide noisy messages while building; we'll show the final count at the end
    countInfo.textContent = "";

    for (let idx = 0; idx < entries.length; idx++) {
      // Yield to the event loop every 40 conversations to reduce blocking
      if (idx % 40 === 0) {
        await new Promise(r => setTimeout(r, 0));
        if (myToken !== filterToken) return;
      }

      const [convIdRaw, bucket] = entries[idx];
      const convId = Number(convIdRaw);
      const convGameKey = conversationGameKey(convId);

      if (gameFilter && convGameKey !== gameFilter) continue;

      const baseChoices = bucket.choices;
      if (!baseChoices || !baseChoices.length) continue;

      const filteredNodes = baseChoices.filter(node => {
        if (isStartNode(node)) return false;
        const nodeSpeakerKey = canonicalSpeakerKey(node);
        const hideMechanicsChecked = hideMechanics ? hideMechanics.checked : true;

        if (hideNarratorChecked && nodeSpeakerKey === "narrator") return false;
        if (hideMechanicsChecked && isMechanicsOnlyNode(node)) return false;
        if (consequentialOnly && !node.isConsequential) return false;

        if (speakerValue === "__player") {
          const isPlayerish =
            nodeSpeakerKey === "player" ||
            nodeSpeakerKey === "narrator";
          if (!isPlayerish) return false;
        } else if (speakerValue) {
          if (nodeSpeakerKey !== speakerValue) return false;
        }

        if (!hasTextSearch) {
          // Skip mechanics-only nodes when not searching
          if (hideMechanicsChecked && isMechanicsOnlyNode(node)) return false;
          return true;
        }

        // Only run expensive text search when q is non-empty
        const aggConds = getAggregatedConditions(node) || [];
        const aggEffs = getAggregatedEffects(node) || [];

        const matches =
          FilterUtils.textMatch(node, q, [
            "choiceText",
            "npcText",
            "conditions",
            "effects",
            "rawTitle",
          ]) ||
          (() => {
            const hay = [
              node.choiceText,
              node.npcText,
              node.rawTitle,
              ...aggConds,
              ...aggEffs,
            ]
              .join(" ")
              .toLowerCase();
            return hay.includes(q.toLowerCase());
          })();

        // For effect-only nodes, only show if search matched
        if (matches) return true;
        if (hideMechanicsChecked && isMechanicsOnlyNode(node)) return false;
        return matches;
      });

      if (filteredNodes.length > 0) {
        filteredByConversation.set(convId, filteredNodes);
        visibleChoices += filteredNodes.length;
      }
    }

    // Update counts
    countInfo.textContent = `Showing ${visibleChoices} of ${totalChoices} choices`;
    try {
      window.parent?.postMessage({ type: "conv-progress", phase: "filter", pct: 100, label: countInfo.textContent }, "*");
    } catch (e) {
      // ignore
    }

    // Build / update conversation shells (headers only) in chunks to avoid blocking
    listContainer.innerHTML = "";
    const sortedConvIds = Array.from(filteredByConversation.keys()).sort(
      (a, b) => a - b
    );
    const chunkSize = 40;
    let renderIndex = 0;

    await new Promise(resolve => {
      function renderChunk() {
        // If a newer filter run started, abort this one
        if (myToken !== filterToken) return resolve();

        const frag = document.createDocumentFragment();
        const end = Math.min(sortedConvIds.length, renderIndex + chunkSize);
        for (let i = renderIndex; i < end; i++) {
          const convId = sortedConvIds[i];
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

          frag.appendChild(convDetails);
        }

        listContainer.appendChild(frag);
        renderIndex = end;

        if (renderIndex < sortedConvIds.length) {
          // Yield to UI thread
          setTimeout(renderChunk, 0);
        } else {
          // Finished
          resolve();
        }
      }

      renderChunk();
    });
  }

  // Hook filters
  searchInput.addEventListener("input", applyFilters);
  speakerSelect.addEventListener("change", applyFilters);
  gameSelect.addEventListener("change", applyFilters);
  hideNarrator.addEventListener("change", applyFilters);
  onlyConsequential.addEventListener("change", applyFilters);
  hideMechanics?.addEventListener("change", applyFilters);

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
        const text =
          node.choiceText ||
          node.enText ||
          node.npcText ||
          node.rawTitle ||
          "";
        // Skip mechanics-only nodes when nothing is selected beyond the base line
        const nothingExtra = !options.conditions && !options.effects && !options.mutex && !options.position;
        if (nothingExtra && isMechanicsOnlyNode(node)) return;
        if (nothingExtra) {
          // Also skip placeholder End() nodes
          const t = text.trim().toLowerCase();
          if (t === "end()" || t === "end") return;
        }
        row.push(`- ${speakerDisplay(node)}: ${text}`.trim());
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
        if (options.mutex && node.mutexIds && node.mutexIds.length) {
          lines.push(`  Mutually exclusive with: ${node.mutexIds.join(", ")}`);
        }
      });

      lines.push(""); // blank line between conversations
    });

    return lines.join("\n");
  }

  function handleExport() {
    const opts = {
      conditions: exportConditions?.checked !== false,
      effects: exportEffects?.checked !== false,
      position: exportPosition?.checked !== false,
      mutex: exportMutex?.checked !== false,
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
