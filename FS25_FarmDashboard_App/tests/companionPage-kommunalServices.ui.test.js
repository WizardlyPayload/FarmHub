/** @jest-environment jsdom */
"use strict";

const { loadCompanionPage } = require("./helpers/companion-page-ui.cjs");
const KEY = "kommunalServices";
const ui = loadCompanionPage(KEY, { title: "Kommunal Services", group: "finance" });

afterEach(() => { document.body.innerHTML = ""; });

test("renders only this farm's running trimmed-area progress", () => {
  const host = ui.renderPage({
    companionMods: { mods: [{ id: KEY, detected: true, version: "1.1.0.0" }] },
    companionPages: { pages: { [KEY]: {
      key: KEY, detected: true, readState: "ok", coverage: "complete",
      byFarm: { "1": { runningCount: 1 } },
      rows: [
        { farmId: 1, missionId: "accepted", targetSquareMeters: 650,
          trimmedSquareMeters: 175, remainingSquareMeters: 475,
          progressPercent: 26.92 },
        { farmId: 2, missionId: "foreign", targetSquareMeters: 900,
          trimmedSquareMeters: 500, remainingSquareMeters: 400,
          progressPercent: 55.56 },
      ],
    } } },
  }, { farmId: 1 });
  expect(host.textContent).toContain("accepted");
  expect(host.textContent).toContain("175");
  expect(host.textContent).toContain("26.92%");
  expect(host.textContent).toContain("not completed contracts or payments");
  expect(host.textContent).not.toContain("foreign");
});
