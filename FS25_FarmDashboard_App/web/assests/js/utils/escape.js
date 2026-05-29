// FS25 FarmDashboard | utils/escape.js | v3.9.0
//
// Single source of truth for escaping untrusted strings before they hit the
// DOM. Loaded as a regular browser script (`window.farmDashEscape`) AND as a
// CommonJS module (`module.exports`) so Jest tests can verify the same
// implementation that ships in production. ES module callers should access
// it via `globalThis.farmDashEscape.escapeHtml(...)` after the page has
// loaded `<script src="assests/js/utils/escape.js"></script>`.

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.farmDashEscape = api;
  }
})(
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : typeof self !== "undefined"
    ? self
    : this,
  function () {
    function escapeHtml(value) {
      if (value == null) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    function escapeAttr(value) {
      return escapeHtml(value);
    }
    return {
      escapeHtml: escapeHtml,
      escapeAttr: escapeAttr,
    };
  }
);
