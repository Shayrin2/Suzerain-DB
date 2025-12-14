// js/core/loader.js
(function (global) {
  const cache = {};

  async function loadText(path) {
    if (cache[path]) return cache[path];

    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`Failed to load "${path}": ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    cache[path] = text;
    return text;
  }

  global.DataLoader = {
    loadText,
  };
})(window);
