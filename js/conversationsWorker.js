importScripts("./core/suzerainParser.js");

self.addEventListener("message", async ({ data }) => {
  if (data.type !== "load") return;

  try {
    let response = await fetch("../data/Suzerain.txt.gz");
    const compressed = response.ok;
    if (response.status === 404) {
      response = await fetch("../data/Suzerain.txt");
    }
    if (response.status === 404) {
      response = await fetch("../data/suzerain.txt");
    }
    if (!response.ok || !response.body) {
      throw new Error(`Could not open dialogue export (HTTP ${response.status})`);
    }

    const parser = SuzerainParser.createParser();
    // The HTTP length measures compressed bytes, while the reader counts decoded bytes.
    const total = compressed ? 0 : Number(response.headers.get("content-length")) || 0;
    const body = compressed
      ? response.body.pipeThrough(new DecompressionStream("gzip"))
      : response.body;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let lastUpdate = 0;
    let remainder = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      received += value.byteLength;
      const lines = (remainder + decoder.decode(value, { stream: true })).split("\n");
      remainder = lines.pop();
      parser.consume(lines);

      const now = performance.now();
      if (now - lastUpdate >= 150) {
        self.postMessage({ type: "progress", received, total });
        lastUpdate = now;
      }
    }

    if (!received) throw new Error("The dialogue export is empty");
    parser.consume([remainder + decoder.decode()]);
    const { nodes, links } = parser.finish();
    if (!nodes.length) throw new Error("No dialogue entries found in the export");
    self.postMessage({ type: "data", nodes, links });
  } catch (error) {
    self.postMessage({ type: "error", error: error.message });
  }
});
