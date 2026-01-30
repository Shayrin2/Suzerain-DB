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
    let lastPath = null;
    let text = null;

    for (const path of paths) {
      try {
        lastPath = path;
        const res = await fetch(path, { cache: "no-cache" });
        if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);

        text = await res.text();

        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastErr) throw lastErr;
    if (text == null) throw new Error(`Failed to fetch Suzerain.txt (${lastPath || "no path"})`);
    if (text.length === 0) {
      throw new Error(`Loaded Suzerain.txt but got 0 bytes (${lastPath || "no path"})`);
    }

    await parseText(text);
  } catch (err) {
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
});
