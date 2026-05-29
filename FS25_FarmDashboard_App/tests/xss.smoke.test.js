// FS25 FarmDashboard | tests/xss.smoke.test.js | v3.9.0
//
// Locks the v3.9 XSS sweep:
//   - The shared `escapeHtml` helper neutralizes all five HTML-significant
//     characters that historically slipped through.
//   - pastures.js routes high-risk untrusted interpolations through `_safe()`.
//   - notifications.js continues to escape title and body through its
//     internal helper.
//
// We don't load real DOM; instead, we test the escape function directly and
// scan source files for the pattern of escape-vs-unescaped interpolation at
// known sinks. That catches regressions without adding a JSDOM dep.

const fs = require("fs");
const path = require("path");
const {
  escapeHtml,
  escapeAttr,
} = require("../web/assests/js/utils/escape.js");

function readFile(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("escapeHtml: neutralizes the five HTML-significant characters", () => {
  test("ampersand", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });
  test("less-than and greater-than", () => {
    expect(escapeHtml("<img src=x>")).toBe("&lt;img src=x&gt;");
  });
  test("double quote", () => {
    expect(escapeHtml('a"b')).toBe("a&quot;b");
  });
  test("single quote", () => {
    expect(escapeHtml("a'b")).toBe("a&#39;b");
  });
  test("hostile script tag is rendered inert", () => {
    const hostile = `</span><img src=x onerror=alert(1)>`;
    const safe = escapeHtml(hostile);
    expect(safe).not.toContain("<img");
    expect(safe).not.toContain("</span>");
    expect(safe).toContain("&lt;img");
  });
  test("null and undefined collapse to empty string", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
  test("escapeAttr is the same function for now", () => {
    expect(escapeAttr('"><')).toBe(escapeHtml('"><'));
  });
});

describe("pastures.js: high-risk interpolations route through _safe()", () => {
  const text = readFile("web/assests/js/modules/pastures.js");

  test("warning modal title escapes pasture.name", () => {
    expect(text).toMatch(/_safe\(pasture\.name\)/);
  });
  test("warning details escape warning.message", () => {
    expect(text).toMatch(/_safe\(warning\.message\)/);
  });
  test("affected-animals row escapes displayName + subType", () => {
    expect(text).toMatch(/_safe\(displayName\)/);
    expect(text).toMatch(/_safe\(animal\.subType \|\| animal\.type \|\| "Unknown"\)/);
  });
  test("low-health drilldown escapes animal.pastureName + name", () => {
    expect(text).toMatch(/_safe\(animal\.pastureName\)/);
  });
  test("dairy mother-offspring detail escapes motherName + offspringName", () => {
    expect(text).toMatch(/_safe\(motherName\)/);
    expect(text).toMatch(/_safe\(offspringName\)/);
  });
  test("pasture card header escapes pasture.name", () => {
    // Two card variants (empty + populated) — at least both occurrences
    // must be wrapped, never raw.
    const matches = text.match(/_safe\(pasture\.name\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
  test("the _safe helper itself is defined in the file", () => {
    expect(text).toMatch(/function _safe\(value\)/);
  });
});

describe("notifications.js: title and body remain escaped", () => {
  const text = readFile("web/assests/js/modules/notifications.js");
  test("title rendered through escapeNotificationHtml", () => {
    expect(text).toMatch(
      /titleSafe\s*=\s*escapeNotificationHtml\(notification\.title\)/
    );
  });
  test("body rendered through escapeNotificationHtml unless explicitly trusted", () => {
    expect(text).toMatch(
      /messageHtmlTrusted === true\s*\?\s*bodyRaw\s*:\s*escapeNotificationHtml\(bodyRaw\)/
    );
  });
});

describe("escape.js helper is loaded by index.html", () => {
  const html = readFile("web/index.html");
  test("script tag references the shared helper", () => {
    expect(html).toMatch(/assests\/js\/utils\/escape\.js/);
  });
});

describe("livestock.js: animal details modal title is escaped", () => {
  const text = readFile("web/assests/js/modules/livestock.js");
  test("modal title uses _safe for name and id", () => {
    expect(text.includes("const titleName = _safe(")).toBe(true);
    expect(/\$\{_safe\(\s*animal\.id\s*\)/.test(text)).toBe(true);
  });
});

describe("livestock.js: table cells escape game-sourced labels", () => {
  const text = readFile("web/assests/js/modules/livestock.js");
  test("formatAnimalType column wrapped with _safe in main row builder", () => {
    expect(text).toMatch(
      /_safe\(this\.formatAnimalType\(animal\.subType \|\| t\("common\.unknown"\)\)\)/
    );
  });
  test("formatLocation escapes location text and type for badge/title", () => {
    expect(text).toMatch(/const safeType = _safe\(locationType/);
    expect(text).toMatch(/const safeLoc = _safe\(location\)/);
  });
});

describe("fields.js: field card escapes engine-provided names", () => {
  const text = readFile("web/assests/js/modules/fields.js");
  test("field title and crop use escapeFieldHtml", () => {
    expect(text).toMatch(
      /\$\{escapeFieldHtml\(field\.name \? String\(field\.name\) : t\("fields\.fieldNameFallback"/
    );
    expect(text).toMatch(
      /\$\{escapeFieldHtml\(formatCropName\(field\.fruitType\)\)\}/
    );
  });
});

describe("economy.js: vehicle and price strings escaped", () => {
  const text = readFile("web/assests/js/modules/economy.js");
  test("defines _safe", () => {
    expect(text).toMatch(/function _safe\(value\)/);
  });
  test("purchase and consumable headers use _safe on names", () => {
    expect(text).toMatch(/\$\{_safe\(resolveVehicleDisplayName\(vehicle\)\)\}/);
    expect(text).toMatch(/_safe\(resolveVehicleBrandLabel\(vehicle\.brand\) \|\| "—"\)/);
  });
  test("price card title escaped", () => {
    expect(text).toMatch(/\$\{_safe\(priceInfo\.title \|\| name\)\}/);
  });
});

describe("changes.js: diff modal escapes game strings", () => {
  const text = readFile("web/assests/js/modules/changes.js");
  test("defines _safe and uses on livestock / warnings", () => {
    expect(text).toMatch(/function _safe\(value\)/);
    expect(text).toMatch(/\$\{_safe\(animal\.name \|\| "Unnamed"\)\}/);
    expect(text).toMatch(/\$\{_safe\(warnMsg\)\}/);
  });
});

describe("vehicles.js: card header escapes display names", () => {
  const text = readFile("web/assests/js/modules/vehicles.js");
  test("defines _safe near top", () => {
    expect(text).toMatch(/function _safe\(value\)/);
  });
  test("card title and brand use _safe", () => {
    expect(text).toMatch(/title="\$\{_safe\(displayName\)\}"/);
    expect(text).toMatch(/\$\{_safe\(displayName\)\}/);
    expect(text).toMatch(/\$\{_safe\(brandName \|\| "—"\)\}/);
  });
});

describe("navigation.js: farm selection list escapes farm fields", () => {
  const text = readFile("web/assests/js/modules/navigation.js");
  test("farm name and ids use _safe in list items", () => {
    expect(text).toMatch(/\$\{_safe\(farm\.name\)\}/);
    expect(text).toMatch(/\$\{_safe\(farm\.id\)\}/);
    expect(text).toMatch(/\$\{_safe\(farm\.internalId\)\}/);
  });
  test("unknown section placeholder escapes sectionName", () => {
    expect(text).toMatch(/\$\{_safe\(sectionName\)\}/);
  });
  test("defines local _safe helper", () => {
    expect(text).toMatch(/function _safe\(value\)/);
  });
});
