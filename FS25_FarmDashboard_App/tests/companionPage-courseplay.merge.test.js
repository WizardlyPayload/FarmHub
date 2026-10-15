"use strict";

const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const mod = require("../companionPages/courseplay.js");

const modules = new Map([[mod.key, mod]]);

describe("courseplay merge", () => {
    test("module is auto-discovered by the lead merger", () => {
        expect(loadModules().get(mod.key)).toBeDefined();
    });

    test("filters settings, sorts active then with-course and drops status for idle vehicles", () => {
        const out = normalizeCompanionPages({
            pages: {
                courseplay: {
                    detected: true,
                    globalSettings: [{ name: "autoRepair", value: 1, text: "On" }, { value: 3 }],
                    byFarm: {
                        "1": {
                            vehicles: [
                                { id: "idle", cpActive: false, status: { waypoint: 3 } },
                                { id: "course", courses: { names: ["Field 4"], count: 1 } },
                                { id: "run", cpActive: true, status: { waypoint: 5, fillLeftPct: 130, compactionPct: -2 } },
                            ],
                        },
                    },
                },
            },
        }, { modules });
        const page = out.pages.courseplay;
        expect(page.globalSettings).toEqual([{ name: "autoRepair", value: 1, text: "On" }]);
        const rows = page.byFarm["1"].vehicles;
        expect(rows.map((r) => r.id)).toEqual(["run", "course", "idle"]);
        expect(rows[0].status).toMatchObject({ waypoint: 5, fillLeftPct: 100, compactionPct: 0 });
        expect(rows[2].status).toBeUndefined();
        expect(rows[1].courses).toMatchObject({ count: 1, names: ["Field 4"] });
    });

    test("missing lists become empty arrays", () => {
        const out = normalizeCompanionPages({ pages: { courseplay: { detected: true, byFarm: { "1": {} } } } }, { modules });
        expect(out.pages.courseplay.globalSettings).toEqual([]);
        expect(out.pages.courseplay.byFarm["1"].vehicles).toEqual([]);
    });
});
