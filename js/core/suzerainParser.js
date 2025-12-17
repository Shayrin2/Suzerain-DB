// js/core/suzerainParser.js
(function (global) {
  function cleanChoiceText(raw) {
    if (!raw) return "";
    let t = String(raw).trim();

    // Strip Player prefixes if present
    t = t.replace(/^Player_Romus:\s*/, "");
    t = t.replace(/^Player:\s*/, "");

    // Unescape \" → "
    t = t.replace(/\\"/g, '"');

    // Many strings are wrapped in extra quotes
    while (t.length > 1 && t.startsWith('"') && t.endsWith('"')) {
      t = t.slice(1, -1).trim();
    }

    return t;
  }

  function createEmptyNode(conversationID) {
    return {
      conversationID: conversationID, // convo id (286, 287, ...)
      id: null,                       // entry id inside that convo (0, 1, 2, ...)

      rawTitle: null,
      menuText: null,
      enText: null,
      npcText: null,

      conditions: [],
      effects: [],
      outgoing: [], // filled later from links

      isPlayerRomus: false,
      choiceText: null,
      _hasMechanics: false,
    };
  }

  function finalizeNode(node) {
    if (!node) return;

    const rawTitle = node.rawTitle || "";
    const menu = node.menuText || "";
    const en = node.enText || "";

    // Mark Romus if any text mentions him
    const textToScan = rawTitle + " " + menu + " " + en;
    if (textToScan.includes("Player_Romus:")) {
      node.isPlayerRomus = true;
    }
    if (textToScan.includes("Player:")) {
      node.isPlayer = true;
    }

    const titleLooksPlayer =
      rawTitle.startsWith("Player_Romus:") || rawTitle.startsWith("Player:");

    let isChoice = false;
    let textSource = "";

    if (titleLooksPlayer) {
      isChoice = true;
      textSource = en || menu || rawTitle;
    } else if (menu && menu.trim() !== "") {
      // Nodes with menu text but generic titles are still choices
      isChoice = true;
      textSource = en || menu || rawTitle;
    }

    node.choiceText = isChoice ? cleanChoiceText(textSource) : null;
  }

  function parseSuzerain(text, onProgress) {
    const lines = text.split(/\r?\n/);
    const totalLines = lines.length || 1;
    let processedLines = 0;
    const notify = () => {
      if (typeof onProgress === "function") {
        onProgress(processedLines, totalLines);
      }
    };

    const nodes = [];
    const links = [];

    let currentConversationID = null;
    let inConversation = false;

    let currentNode = null;
    let inDialogue = false;
    let lastFieldTitle = null;

    // temp for link parsing
    let tmpOriginConv = null;
    let tmpOriginId = null;
    let tmpDestConv = null;

    function flushNode() {
      if (!currentNode) return;
      finalizeNode(currentNode);

      // Mark mechanics
      currentNode._hasMechanics =
        (currentNode.conditions && currentNode.conditions.length > 0) ||
        (currentNode.effects && currentNode.effects.length > 0);

      nodes.push(currentNode);
      currentNode = null;
      inDialogue = false;
      lastFieldTitle = null;
    }

    for (const raw of lines) {
      processedLines++;
      if (processedLines % 5000 === 0) {
        notify();
      }

      const line = raw.trim();
      if (!line) continue;

      // Start of a Conversation block
      if (line.startsWith("Conversation data")) {
        flushNode();
        inConversation = true;
        currentConversationID = null;
        inDialogue = false;
        continue;
      }

      // Inside a Conversation before dialogue entries: grab its id once
      if (inConversation && !inDialogue && currentConversationID == null) {
        const mConv = line.match(/^int id = (\d+)/);
        if (mConv) {
          currentConversationID = parseInt(mConv[1], 10);
          continue;
        }
      }

      // Start of a DialogueEntry inside the current conversation
      if (line.startsWith("DialogueEntry data")) {
        flushNode();
        if (currentConversationID == null) {
          // Should not happen, but guard anyway
          inDialogue = false;
          continue;
        }
        currentNode = createEmptyNode(currentConversationID);
        inDialogue = true;
        lastFieldTitle = null;
        continue;
      }

      // Conversation end: next Conversation or leaving the section
      if (inConversation && line.startsWith("[") && line.endsWith("]")) {
        // new sub-array index line; we don't flush conversation here, only nodes.
        // We'll detect new Conversation data when it appears.
      }

      if (!inDialogue) {
        // Outside any DialogueEntry, ignore lines except when they start a new Conversation
        continue;
      }

      // === We are inside a DialogueEntry ===
      let m;

      // Local node id inside this conversation
      m = line.match(/^int id = (\d+)/);
      if (m) {
        currentNode.id = parseInt(m[1], 10);
        continue;
      }

      // (There is also an "int conversationID =" inside the entry, but we already know it
      // from the Conversation block. We can ignore it, or cross-check:)
      m = line.match(/^int conversationID = (\d+)/);
      if (m) {
        const convIdInner = parseInt(m[1], 10);
        if (
          currentNode.conversationID != null &&
          currentNode.conversationID !== convIdInner
        ) {
          console.warn(
            "conversationID mismatch for entry",
            currentNode.id,
            "conv block",
            currentNode.conversationID,
            "entry says",
            convIdInner
          );
        }
        continue;
      }

      // Field title / value pairs
      m = line.match(/^string title = "(.*)"/);
      if (m) {
        lastFieldTitle = m[1];
        continue;
      }

      m = line.match(/^string value = "(.*)"/);
      if (m) {
        const val = m[1];

        switch (lastFieldTitle) {
          case "Title":
            currentNode.rawTitle = val;
            break;
          case "Menu Text":
          case "Menu Text en":
            currentNode.menuText = val;
            break;
          case "Dialogue Text":
            currentNode.npcText = val;
            break;
          case "en":
            currentNode.enText = val;
            break;
          default:
            break;
        }
        continue;
      }

      // Conditions
      m = line.match(/^string\s+conditionsString\s*=\s*"(.*)"/i);
      if (m) {
        const cond = m[1];
        if (cond && cond.trim() !== "") {
          currentNode.conditions.push(cond);
        }
        continue;
      }

      // Effects (userScript / onExecute): Variable["X"] = / += / -= value;
      m = line.match(/Variable\["([^"]+)"\]\s*(=|\+=|-=)\s*([^;]+)/);
      if (m) {
        const variable = m[1];
        const op = m[2];
        const value = m[3].trim();
        currentNode.effects.push(`${variable} ${op} ${value}`);
        continue;
      }

      // === Link data (inside this DialogueEntry) ===
      m = line.match(/^int originConversationID = (\d+)/);
      if (m) {
        tmpOriginConv = parseInt(m[1], 10);
        continue;
      }

      m = line.match(/^int originDialogueID = (\d+)/);
      if (m) {
        tmpOriginId = parseInt(m[1], 10);
        continue;
      }

      m = line.match(/^int destinationConversationID = (\d+)/);
      if (m) {
        tmpDestConv = parseInt(m[1], 10);
        continue;
      }

      m = line.match(/^int destinationDialogueID = (\d+)/);
      if (m) {
        const destId = parseInt(m[1], 10);
        const originConv = tmpOriginConv != null ? tmpOriginConv : currentNode.conversationID;
        const originId = tmpOriginId != null ? tmpOriginId : currentNode.id;
        const destConv = tmpDestConv != null ? tmpDestConv : currentNode.conversationID;

        links.push({
          originConversationID: originConv,
          originDialogueID: originId,
          destinationConversationID: destConv,
          destinationDialogueID: destId,
        });

        // reset temp link state
        tmpOriginConv = null;
        tmpOriginId = null;
        tmpDestConv = null;
        continue;
      }
    }

    // Flush last node
    flushNode();

    // Final progress update
    notify();

    // Build node lookup by (conversationID, id)
    const nodeByKey = new Map();
    for (const n of nodes) {
      if (n.conversationID == null || n.id == null) continue;
      const key = `${n.conversationID}:${n.id}`;
      nodeByKey.set(key, n);
    }

    // Attach outgoing links to origin nodes
    for (const link of links) {
      const key = `${link.originConversationID}:${link.originDialogueID}`;
      const originNode = nodeByKey.get(key);
      if (!originNode) continue;
      originNode.outgoing.push({
        conversationID: link.destinationConversationID,
        id: link.destinationDialogueID,
      });
    }

    // Build choices / triggers lists
    const choices = [];
    const triggers = [];

    for (const n of nodes) {
      if (n.choiceText) {
        choices.push(n);
      } else if (n._hasMechanics) {
        triggers.push(n);
      }
    }

    return {
      nodes,
      links,
      choices,
      triggers,
    };
  }

  global.SuzerainParser = {
    parseSuzerain,
  };
})(window);
