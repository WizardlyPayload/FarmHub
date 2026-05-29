// FS25 FarmDashboard | tests/i18n.coverage.test.js | v3.9.0
//
// Guard test against backsliding on the i18n sweep performed in v3.9.
// We don't try to police every string in the codebase (large and noisy);
// instead we assert that previously-fixed user-facing literals stay routed
// through the t() runtime. If you intentionally rename a label, update both
// the code AND the corresponding entry in messages/en.json + translations.json,
// then update the regex below.

const fs = require("fs");
const path = require("path");

function readFile(rel) {
  const full = path.join(__dirname, "..", rel);
  return fs.readFileSync(full, "utf8");
}

const PASTURES_BANNED = [
  "<strong>Total Animals:</strong>",
  "<strong>Avg Health:</strong>",
  "<strong>Males:</strong>",
  "<strong>Females:</strong>",
  "<strong>Productivity:</strong>",
  "<strong>Lactating:</strong>",
  "<strong>Available Food:</strong>",
  "<strong>Water:</strong>",
  "<strong>Straw:</strong>",
  "<strong>Production: </strong>",
  "Active Warnings\n",
  '<span class="badge bg-danger">Critical</span>',
  '<span class="badge bg-warning">Poor</span>',
  '<span class="badge status-pregnant">Pregnant</span>',
  '<span class="badge status-lactating">Lactating</span>',
  '<span class="badge bg-success">Normal</span>',
  "<small>Total Affected</small>",
  "<small>Lactating Cows</small>",
  "<small>Aging Animals</small>",
  "<small>Names</small>",
  "<small>Current Animals</small>",
  "<small>Max Capacity</small>",
  "<small>Utilization</small>",
  "<small>Available Space</small>",
  "<small>Total Value</small>",
  "<small>Animal Types</small>",
  "<small>Lactating Mothers</small>",
  "<small>Young Animals</small>",
  "Capacity Calculation Details\n",
  "Pasture Livestock Value\n",
  "Mother-Offspring Pairs\n",
  "<strong>Source:</strong>",
  "<strong>Method:</strong>",
  "<strong>Formula:</strong>",
  "<strong>Details:</strong>",
];

const NOTIFICATIONS_BANNED = [
  "<p>No notifications yet</p>",
  '"Just now"',
  "minute${diffMinutes > 1",
  "hour${diffHours > 1",
  "day${diffDays > 1",
];

describe("i18n: pastures.js previously-fixed literals stay routed through t()", () => {
  const text = readFile("web/assests/js/modules/pastures.js");
  test.each(PASTURES_BANNED)(
    "does not contain banned literal: %s",
    (banned) => {
      expect(text.includes(banned)).toBe(false);
    }
  );
});

describe("i18n: notifications.js previously-fixed literals stay routed through t()", () => {
  const text = readFile("web/assests/js/modules/notifications.js");
  test.each(NOTIFICATIONS_BANNED)(
    "does not contain banned literal: %s",
    (banned) => {
      expect(text.includes(banned)).toBe(false);
    }
  );
});

describe("i18n: required keys exist in messages/en.json", () => {
  const en = JSON.parse(readFile("web/locales/messages/en.json"));
  const REQUIRED = [
    "pastures.card.totalAnimals",
    "pastures.card.avgHealth",
    "pastures.card.males",
    "pastures.card.females",
    "pastures.card.productivity",
    "pastures.card.lactating",
    "pastures.card.lactatingAnimals",
    "pastures.card.availableFood",
    "pastures.card.water",
    "pastures.card.straw",
    "pastures.card.production",
    "pastures.warningsHeading",
    "pastures.tableName",
    "pastures.tableType",
    "pastures.tableHealth",
    "pastures.tableAge",
    "pastures.tableStatus",
    "pastures.tablePasture",
    "pastures.statusCritical",
    "pastures.statusPoor",
    "pastures.statusPregnant",
    "pastures.statusLactating",
    "pastures.statusNormal",
    "pastures.lowHealthDrilldownTitle",
    "pastures.lowHealthAllGood",
    "pastures.lowHealthNeedAttention",
    "pastures.detail.totalAffected",
    "pastures.detail.lactatingCows",
    "pastures.detail.agingAnimals",
    "pastures.detail.names",
    "pastures.detail.currentAnimals",
    "pastures.detail.maxCapacity",
    "pastures.detail.utilization",
    "pastures.detail.availableSpace",
    "pastures.detail.totalValue",
    "pastures.detail.avgPerAnimal",
    "pastures.detail.animalTypes",
    "pastures.detail.lactatingMothers",
    "pastures.detail.youngAnimals",
    "pastures.detail.potentialDailyGain",
    "pastures.detail.capCalcHeading",
    "pastures.detail.source",
    "pastures.detail.method",
    "pastures.detail.formula",
    "pastures.detail.details",
    "pastures.detail.livestockValueHeading",
    "pastures.detail.valueBreakdownHeading",
    "pastures.detail.motherOffspringHeading",
    "pastures.detail.recommendationLabel",
    "pastures.detail.recommendationCopy",
    "notifications.empty",
    "notifications.justNow",
    "notifications.minutesAgoOne",
    "notifications.minutesAgoMany",
    "notifications.hoursAgoOne",
    "notifications.hoursAgoMany",
    "notifications.daysAgoOne",
    "notifications.daysAgoMany",
  ];
  test.each(REQUIRED)("key exists: %s", (key) => {
    expect(typeof en[key]).toBe("string");
    expect(en[key].length).toBeGreaterThan(0);
  });
});

describe("i18n: required keys exist in translations.json (runtime catalog)", () => {
  const cat = JSON.parse(readFile("web/locales/translations.json"));
  const SAMPLE = [
    "pastures.card.totalAnimals",
    "pastures.warningsHeading",
    "pastures.statusCritical",
    "notifications.empty",
    "notifications.justNow",
  ];
  test.each(SAMPLE)("translations.json has key: %s", (key) => {
    expect(cat.strings && typeof cat.strings === "object").toBe(true);
    expect(cat.strings[key] && typeof cat.strings[key]).toBe("object");
    expect(typeof cat.strings[key].en).toBe("string");
  });
});
