"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "CourseplayCollector.lua";

const SETUP = `
    local function setting(name, value, text)
        return { name = name, getValue = function() return value end, getString = function() return text end,
                 setValue = function() error("write") end }
    end
    local gs = { settings = {} }
    for _, s in ipairs({ setting("wageModifier", 100, "100%"), setting("autoRepair", 70, "below 70%"),
                         setting("stopThreshingDuringRain", true, "Yes") }) do
        gs[s.name] = s
        gs.settings[#gs.settings + 1] = s
    end
    local function course(name, n, width)
        return { getName = function() return name end, getNumberOfWaypoints = function() return n end,
                 getWorkWidth = function() return width end, getMultiTools = function() return 1 end }
    end
    local function veh(owner, name, opts)
        return {
            ownerFarmId = owner, uniqueId = "veh-" .. name, spec_cpAIWorker = {},
            spec_cpHud = { status = opts.status },
            getFullName = function() return name end,
            getIsCpActive = function() return opts.active == true end,
            getIsAIActive = function() return opts.ai == true end,
            getIsCpFieldWorkActive = function() return opts.fieldWork == true end,
            getIsCpDriveToFieldWorkActive = function() return false end,
            getIsCpCourseRecorderActive = function() return opts.recording == true end,
            getCourses = function() return opts.courses or {} end,
            getCpStartText = function() return opts.job or "---" end,
            startCpAtFirstWp = function() error("write") end,
        }
    end
    _G.g_modIsLoaded = { FS25_Courseplay = true, FS25_CourseplayGps = true }
    _G.FS25_Courseplay = { g_Courseplay = { globalSettings = gs } }
    _G.g_currentMission = { vehicleSystem = { vehicles = {
        veh(1, "Idle tractor", { courses = { course("Field 7", 812, 6) }, job = "Field work" }),
        veh(1, "Busy combine", { active = true, ai = true, fieldWork = true, courses = { course("Field 3", 1500, 9.1) },
            status = { isActive = true, currentWaypointIx = 300, numberOfWaypoints = 1500, remainingTimeText = "00:42" } }),
        veh(1, "Vanilla helper", { ai = true }),
        veh(2, "Neighbour", { active = true }),
        { ownerFarmId = 1, uniqueId = "trailer" },
    } } }
`;

describe("Courseplay page collector", () => {
    test("matches only the exact Courseplay folder, not Courseplay GPS", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = { FS25_CourseplayGps = true }", { farmId: 1 })).toBeUndefined();
    });

    test("exports global settings and per-vehicle job, course and progress", () => {
        const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
        expect(page.modName).toBe("FS25_Courseplay");
        expect(page.readState).toBe("ok");
        expect(page.globalSettings).toEqual([
            { name: "wageModifier", value: 100, text: "100%" },
            { name: "autoRepair", value: 70, text: "below 70%" },
            { name: "stopThreshingDuringRain", value: true, text: "Yes" },
        ]);
        const farm = page.byFarm["1"];
        expect(farm).toMatchObject({ cpVehicleCount: 3, activeCount: 1, fieldWorkCount: 1, withCourseCount: 2, helperCount: 1, recordingCount: 0 });
        expect(farm.vehicles.map((v) => v.name)).toEqual(["Busy combine", "Idle tractor", "Vanilla helper"]);
        expect(farm.vehicles[0]).toMatchObject({
            cpActive: true, fieldWork: true,
            courses: { count: 1, names: ["Field 3"], waypoints: 1500, workWidth: 9.1, multiTools: 1 },
            status: { isActive: true, waypoint: 300, waypoints: 1500, remainingTime: "00:42" },
        });
        expect(farm.vehicles[1]).toMatchObject({ cpActive: false, selectedJob: "Field work" });
        expect(farm.vehicles[1].status).toBeUndefined();
        expect(farm.vehicles[2]).toMatchObject({ otherHelper: true });
        expect(JSON.stringify(page)).not.toContain("Neighbour");
    });
});
