// js/core/filter.js
(function (global) {
  function norm(value) {
    return (value == null ? "" : String(value)).toLowerCase();
  }

  function textMatch(item, query, fields) {
    const q = norm(query).trim();
    if (!q) return true;

    for (const field of fields) {
      const value = item[field];

      if (Array.isArray(value)) {
        if (value.some(v => norm(v).includes(q))) return true;
      } else if (norm(value).includes(q)) {
        return true;
      }
    }
    return false;
  }

  global.FilterUtils = {
    textMatch,
  };
})(window);
