// js/core/loader.js
(function (global) {
  const cache = {};
  const storage = (() => {
    try {
      return global.top?.sessionStorage || global.sessionStorage;
    } catch (e) {
      return global.sessionStorage;
    }
  })();

  async function loadText(path) {
    if (cache[path]) return cache[path];

    // Try sessionStorage cache (preloaded on index)
    try {
      const stored = storage.getItem(`preload:${path}`);
      if (stored) {
        cache[path] = stored;
        return stored;
      }
    } catch (e) {
      // ignore storage errors
    }

    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`Failed to load "${path}": ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    cache[path] = text;
    try {
      storage.setItem(`preload:${path}`, text);
    } catch (e) {
      // ignore storage quota errors
    }
    return text;
  }

  global.DataLoader = {
    loadText,
  };
})(window);
