// FS25 FarmDashboard | realtime-dedupe.js | v3.9.0
//
// Pure helper for the realtime-connector payload dedupe key. Loaded as a
// regular browser script (`window.farmDashRealtimeDedupe`) AND as a
// CommonJS module (`module.exports`). The formula must include the active
// farm and server context so that switching farm/server invalidates the
// dedupe cache automatically — even if the body bytes are identical.

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.farmDashRealtimeDedupe = api;
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
    var VOLATILE_FIELDS = ["timestamp", "dataTimestamps", "fieldStatusHistory"];

    function stripVolatile(data) {
      if (!data || typeof data !== "object") return {};
      var rest = {};
      for (var k in data) {
        if (
          Object.prototype.hasOwnProperty.call(data, k) &&
          VOLATILE_FIELDS.indexOf(k) === -1
        ) {
          rest[k] = data[k];
        }
      }
      return rest;
    }

    /**
     * Build the dedupe fingerprint for a /api/data response.
     * @param {object} data
     * @param {number|string} farmId
     * @param {string} serverId
     */
    function computePayloadDedupeKey(data, farmId, serverId) {
      var rest = stripVolatile(data);
      return (
        JSON.stringify(rest) +
        "|" +
        Number(farmId != null ? farmId : 1) +
        "|" +
        String(serverId != null ? serverId : "")
      );
    }

    return {
      computePayloadDedupeKey: computePayloadDedupeKey,
      stripVolatile: stripVolatile,
      VOLATILE_FIELDS: VOLATILE_FIELDS,
    };
  }
);
