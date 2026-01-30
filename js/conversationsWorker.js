// js/conversationsWorker.js
// Parse Suzerain.txt off the main thread and return nodes/links/choices

// suzerainParser expects a window global; alias self
self.window = self;
importScripts("./core/suzerainParser.js");

self.addEventListener("message", async event => {
  const msg = event.data || {};
  const { type } = msg;

  // Helper: parse provided text and post progress updates
  async function parseText(text) {
    const parsed = SuzerainParser.parseSuzerain(text, (done, total) => {
      self.postMessage({
        type: "parse-progress",
        processed: done,
        total
      });
    });

    self.postMessage({
      type: "data",
      nodes: parsed.nodes || [],
      links: parsed.links || [],
      choices: parsed.choices || []
    });
  }

  // If the main thread already has the text (preloaded), just parse it.
  if (type === "parseText" && typeof msg.text === "string") {
    try {
      await parseText(msg.text);
    } catch (err) {
      self.postMessage({ type: "error", error: err?.message || String(err) });
    }
    return;
  }

  if (type !== "load") return;

  try {
    const paths = [
      "../data/Suzerain.txt",
      "../data/suzerain.txt",
      "data/Suzerain.txt",
      "data/suzerain.txt",
      "/data/Suzerain.txt",
      "/data/suzerain.txt"
    ];
    let lastErr = null;
    let text = null;

    for (const path of paths) {
      try {
        const res = await fetch(path, { cache: "no-cache" });
        if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);

        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const total = Number(res.headers.get("content-length")) || 0;
          const chunks = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.length;
              self.postMessage({ type: "progress", received, total });
            }
          }

          const merged = new Uint8Array(received);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.length;
          }
          text = new TextDecoder().decode(merged);
        } else {
          text = await res.text();
        }

        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastErr) throw lastErr;
    if (!text) throw new Error("Failed to fetch Suzerain.txt");

    await parseText(text);
  } catch (err) {
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
});
