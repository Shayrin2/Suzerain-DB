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

  let conversations = new Map();      // convId -> { choices: Node[] }
  let allNodes = [];                  // all choice nodes
  let totalChoices = 0;
  let nodeByKey = new Map();          // `${convId}:${id}` -> node
  let childrenByKey = new Map();      // `${convId}:${id}` -> [{conversationID,id}]
  let parentsByKey = new Map();       // `${convId}:${id}` -> [{conversationID,id}]

  let filteredByConversation = new Map();
  let alternativesByNode = new Map();

  const RENDERED_CARD_FLAG = Symbol("renderedCards");
  let dataReady = false;

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

    return card;
  }

  function preferredParent(node) {
    const parents = parentsByKey.get(`${node.conversationID}:${node.id}`) || [];
    return parents.find(ref => ref.conversationID === node.conversationID) || parents[0];
  }

  function findChoicePrompt(node) {
    let frontier = [preferredParent(node)].filter(Boolean);
    const visited = new Set();

    for (let depth = 0; frontier.length && depth < 8; depth++) {
      const next = [];
      let playerPrompt = null;

      for (const ref of frontier) {
        const key = `${ref.conversationID}:${ref.id}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const parent = nodeByKey.get(key);
        const text = (parent?.enText || parent?.npcText || parent?.choiceText || "")
          .replace(/\s+/g, " ").trim();
        if (text && !isStartNode(parent) && !isMechanicsOnlyNode(parent)) {
          const prompt = { text, speaker: speakerDisplay(parent) };
          if (canonicalSpeakerKey(parent) !== "player") return prompt;
          playerPrompt ??= prompt;
        }

        for (const incoming of parentsByKey.get(key) || []) {
          if (incoming.conversationID === ref.conversationID) next.push(incoming);
        }
      }

      if (playerPrompt) return playerPrompt;
      frontier = next;
    }
    return null;
  }

  function indexAlternatives() {
    alternativesByNode = new Map();
    for (const [convId, { choices }] of conversations) {
      const groups = new Map();
      for (const node of choices) {
        const parent = preferredParent(node);
        if (!parent) continue;

        const key = `${parent.conversationID}:${parent.id}`;
        if (!groups.has(key)) groups.set(key, []);
        const group = groups.get(key);
        group.push(node);
        alternativesByNode.set(node, group);
      }
    }
  }

  function renderConversationCards(convId, container) {
    if (container[RENDERED_CARD_FLAG]) return;
    container[RENDERED_CARD_FLAG] = true;

    const gameKey = conversationGameKey(convId);
    const nodes = [...(filteredByConversation.get(convId) || [])];
    nodes.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    const matchingNodes = new Set(nodes);
    const groups = new Map();
    for (const node of nodes) {
      const card = buildNodeCard(node, gameKey);
      if (!card) continue;
      const group = alternativesByNode.get(node);
      const key = group?.length > 1 ? group : node;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    }

    const fragment = document.createDocumentFragment();
    for (const [key, cards] of groups) {
      if (!Array.isArray(key)) {
        fragment.appendChild(cards[0]);
        continue;
      }

      const hiddenCards = key
        .filter(node => !matchingNodes.has(node))
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
        .map(node => buildNodeCard(node, gameKey))
        .filter(Boolean);
      const total = cards.length + hiddenCards.length;
      if (total === 1) {
        fragment.appendChild(cards[0]);
        continue;
      }

      const section = document.createElement("section");
      section.className = "choice-group";
      const heading = document.createElement("h4");
      heading.className = "choice-group__title";
      const prompt = findChoicePrompt(key[0]);
      if (prompt) {
        const limit = 80;
        const excerpt = prompt.text.slice(0, limit);
        const wordEnd = excerpt.lastIndexOf(" ");
        heading.textContent = prompt.text.length <= limit
          ? prompt.text
          : `${excerpt.slice(0, wordEnd > 0 ? wordEnd : limit)}…`;
        const metadata = document.createElement("p");
        metadata.className = "choice-group__meta";
        metadata.textContent = `${prompt.speaker} · ${total} options`;
        section.append(heading, metadata);

        if (prompt.text.length > limit) {
          const context = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = "Read full dialogue";
          const line = document.createElement("p");
          line.textContent = prompt.text;
          context.append(summary, line);
          section.appendChild(context);
        }
      } else {
        const parent = preferredParent(key[0]);
        heading.textContent = parent
          ? `Choices after node ${parent.id} · ${total} options`
          : `Mutually exclusive choices · ${total} options`;
        section.appendChild(heading);
      }
      section.append(...cards);

      if (hiddenCards.length) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = hiddenCards.length === 1
          ? "Show 1 alternative hidden by filters"
          : `Show ${hiddenCards.length} alternatives hidden by filters`;
        const alternatives = document.createElement("div");
        alternatives.className = "choice-group__alternatives";
        alternatives.append(...hiddenCards);
        details.append(summary, alternatives);
        section.appendChild(details);
      }
      fragment.appendChild(section);
    }
    container.replaceChildren(fragment);
  }

  // ---- data load ----

  countInfo.textContent = "Loading conversations...";

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

    indexAlternatives();

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
  }

  function loadData() {
    let worker;

    function showLoadError(error) {
      worker?.terminate();
      console.error("Failed to load conversations:", error);
      countInfo.textContent = "Could not load conversations. Check that data/Suzerain.txt.gz or data/Suzerain.txt is available and reload.";
    }

    try {
      worker = new Worker("../js/conversationsWorker.js");
    } catch (error) {
      showLoadError(error);
      return;
    }

    worker.addEventListener("message", ({ data }) => {
      if (data.type === "progress") {
        const progress = data.total
          ? `${Math.round(data.received / data.total * 100)}%`
          : `${Math.round(data.received / 1024 / 1024)} MiB`;
        countInfo.textContent = `Loading conversations… ${progress}`;
      } else if (data.type === "data") {
        worker.terminate();
        processData(data).catch(showLoadError);
      } else if (data.type === "error") {
        showLoadError(data.error);
      }
    });
    worker.addEventListener("error", showLoadError);
    worker.postMessage({ type: "load" });
  }

  loadData();

  // ---- filtering & shell rendering ----

  let filterToken = 0;

  async function applyFilters() {
    const myToken = ++filterToken;
    if (!dataReady) return;

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

        if (!hasTextSearch) return true;

        // Only run expensive text search when q is non-empty
        const aggConds = getAggregatedConditions(node) || [];
        const aggEffs = getAggregatedEffects(node) || [];

        return (
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
          })()
        );
      });

      if (filteredNodes.length > 0) {
        filteredByConversation.set(convId, filteredNodes);
        visibleChoices += filteredNodes.length;
      }
    }

    countInfo.textContent = `Showing ${visibleChoices} of ${totalChoices} choices`;
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
          resolve();
        }
      }

      renderChunk();
    });
  }

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
        if (options.mutex) {
          const alternatives = alternativesByNode.get(node);
          if (alternatives?.length > 1) {
            const ids = alternatives.filter(other => other !== node).map(other => other.id);
            lines.push(`  Mutually exclusive with: ${ids.join(", ")}`);
          }
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
