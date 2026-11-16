(function (global) {
  const script = document.currentScript;
  const assetUrl = new URL("../../data/Entity%20Text%20Asset.txt", script.src);
  let entityAsset;

  function extractDataBlocks(text) {
    const blocks = Object.create(null);
    const headers = [...text.matchAll(/^[\t ]*string\s+(\w+)DataJson\s*=\s*"/gm)];
    for (const [index, header] of headers.entries()) {
      const start = header.index + header[0].length;
      const segment = text.slice(start, headers[index + 1]?.index);
      const closingQuote = segment.lastIndexOf('"');
      blocks[header[1]] = (closingQuote === -1 ? segment : segment.slice(0, closingQuote)).trim();
    }
    return blocks;
  }

  async function fetchEntityAsset() {
    const response = await fetch(assetUrl);
    if (!response.ok) {
      throw new Error(`Failed to load Entity Text Asset (HTTP ${response.status})`);
    }
    const raw = await response.text();
    return { raw, blocks: extractDataBlocks(raw) };
  }

  function loadEntityAsset() {
    if (global.parent && global.parent !== global) {
      try {
        if (global.parent.DataLoader) return global.parent.DataLoader.loadEntityAsset();
      } catch {
        // A standalone page can also be embedded by a different origin.
      }
    }
    entityAsset ??= fetchEntityAsset().catch(error => {
      entityAsset = undefined;
      throw error;
    });
    return entityAsset;
  }

  global.DataLoader = { loadEntityAsset };
})(window);
