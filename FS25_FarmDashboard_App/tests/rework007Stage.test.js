"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { productionTs } = require("./helpers/production-source.cjs");
const {
    handleSaveModConfig,
    parseModConfigXml,
    classifyModConfigText,
} = require("../modConfigXml");
const {
    updateLiveSectionBackup,
    applyLiveSectionHold,
    updateLastGoodMergedSnapshot,
    buildHeldPayloadFromState,
    mergeFieldsMoistureForward,
    liftSectionOutcomes,
} = require("../mergedSnapshotHold");
const { saveServerCache, loadServerCache } = require("../serverDataCache");
const { settingsDomainsToWrite, runSettingsSave } = productionTs("NEW APP/src/settings/save-domains.ts");

const io = {
    pathExists: async (file) => fs.existsSync(file),
    readFile: async (file) => fs.readFileSync(file, "utf8"),
    assertGameWritesAllowed: async () => ({ ok: true }),
};

function tempXml(name, text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh007-xml-"));
    const file = path.join(dir, name);
    fs.writeFileSync(file, text, "utf8");
    return file;
}

async function saveInterval(text, next) {
    const file = tempXml("config.xml", text);
    const saved = await handleSaveModConfig(file, {
        expectedRevision: classifyModConfigText(true, text).revision,
        updateInterval: next,
    }, io);
    return { saved, parsed: parseModConfigXml(fs.readFileSync(file, "utf8")), text: fs.readFileSync(file, "utf8") };
}

describe("REWORK-007 production contracts", () => {
    test("attribute spans ignore quoted text, hyphen names, namespaces and nested tags", async () => {
        const quoted = "<farmDashboard><settings note='x updateInterval=\"7777\"' updateInterval=\"10000\"/><modules fields=\"false\"/></farmDashboard>";
        const quotedSave = await saveInterval(quoted, 12000);
        expect(quotedSave.saved.ok).toBe(true);
        expect(quotedSave.parsed.updateInterval).toBe(12000);
        expect(quotedSave.text).toContain("note='x updateInterval=\"7777\"'");

        const hyphen = "<farmDashboard><settings extension-updateInterval=\"7777\" updateInterval=\"10000\"/><modules fields=\"false\"/></farmDashboard>";
        const hyphenSave = await saveInterval(hyphen, 12000);
        expect(hyphenSave.saved.ok).toBe(true);
        expect(hyphenSave.parsed.updateInterval).toBe(12000);
        expect(hyphenSave.text).toContain("extension-updateInterval=\"7777\"");

        const named = "<farmDashboard><settings ns:updateInterval=\"7777\" updateInterval='10000'/><modules fields=\"false\"/></farmDashboard>";
        const namedSave = await saveInterval(named, 12000);
        expect(namedSave.parsed.updateInterval).toBe(12000);
        expect(namedSave.text).toContain("ns:updateInterval=\"7777\"");

        const nested = "<farmDashboard><!-- <settings updateInterval=\"1\"/> --><extension><settings updateInterval=\"7777\"/></extension><settings updateInterval=\"10000\" note=\"say 'keep'\"/><modules fields=\"false\"/></farmDashboard>";
        const nestedSave = await saveInterval(nested, 12000);
        expect(nestedSave.parsed.updateInterval).toBe(12000);
        expect(nestedSave.text).toContain("<settings updateInterval=\"7777\"/>");
        expect(nestedSave.text).toContain("note=\"say 'keep'\"");

        const file = tempXml("twice.xml", quoted);
        const first = await handleSaveModConfig(file, {
            expectedRevision: classifyModConfigText(true, quoted).revision,
            updateInterval: 12000,
        }, io);
        const second = await handleSaveModConfig(file, {
            expectedRevision: first.revision,
            collectionCycleMs: 15000,
        }, io);
        const twice = parseModConfigXml(fs.readFileSync(file, "utf8"));
        expect(second.ok).toBe(true);
        expect(twice.updateInterval).toBe(12000);
        expect(twice.collectionCycleMs).toBe(15000);
        expect(twice.minWriteIntervalMs).toBe(4000);

        const broken = await handleSaveModConfig(tempXml("bad.xml", "<farmDashboard><settings updateInterval=\"10000\""), {
            expectedRevision: "abc",
            updateInterval: 12000,
        }, io);
        expect(broken.ok).toBe(false);
        const duplicate = "<farmDashboard><settings updateInterval=\"10000\"/><settings updateInterval=\"10000\"/><modules fields=\"false\"/></farmDashboard>";
        const dupFile = tempXml("dup.xml", duplicate);
        const dup = await handleSaveModConfig(dupFile, {
            expectedRevision: classifyModConfigText(true, duplicate).revision,
            updateInterval: 12000,
        }, io);
        expect(dup.ok).toBe(false);
        expect(fs.readFileSync(dupFile, "utf8")).toBe(duplicate);
    });

    test("settings orchestration writes the mod domain through the real save handler", async () => {
        const text = "<farmDashboard><settings updateInterval=\"10000\"/><modules fields=\"false\"/></farmDashboard>";
        const file = tempXml("orch.xml", text);
        const revision = classifyModConfigText(true, text).revision;
        const result = await runSettingsSave({
            displayNow: "d",
            displayBaseline: "d",
            connectionNow: "c",
            connectionBaseline: "c",
            modNow: "changed",
            modBaseline: "saved",
            modRevision: revision,
            lanNow: "l",
            lanBaseline: "l",
            lanSecretPending: false,
        }, {
            saveDisplay: async () => ({ ok: true }),
            saveConnection: async () => ({ ok: true }),
            saveMod: async (expected) => handleSaveModConfig(file, { expectedRevision: expected, updateInterval: 12000 }, io),
            saveLan: async () => ({ ok: true }),
        });
        expect(settingsDomainsToWrite({
            displayChanged: false,
            connectionChanged: false,
            modChanged: true,
            lanChanged: false,
        })).toEqual(["mod"]);
        expect(result.committed).toEqual(["mod"]);
        expect(parseModConfigXml(fs.readFileSync(file, "utf8")).updateInterval).toBe(12000);
    });

    test("serialized complete-empty, measured zero and authoritative disable survive hold and disk", () => {
        const rich = { vehicles: [{ id: "v1" }], fields: [{ id: 7, farmlandId: 7, hectares: 2 }] };
        const state = {
            sectionAge: "current",
            lastGoodMergedSnapshot: {
                animals: [{ animalCount: 2 }],
                production: { chains: [{ id: "mill" }] },
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50, fillTypeIndex: 2 }] } } },
                fields: [{ id: 7, farmlandId: 7, hectares: 2 }],
                vehicles: [{ id: "v1" }],
            },
            liveSectionBackup: {
                animals: [{ animalCount: 2 }],
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50, fillTypeIndex: 2 }] } } },
            },
        };
        const animals = [];
        animals.readState = "ok";
        animals.coverage = "complete";
        const producer = {
            animals,
            production: { chains: [], readState: "ok", coverage: "complete" },
            stock: {
                enabled: true,
                readState: "ok",
                coverage: "complete",
                byFarm: { "1": { items: [{ totalLiters: 0, fillTypeIndex: 2 }] } },
            },
            fields: [{ id: 7, farmlandId: 7, hectares: 2 }],
            vehicles: [{ id: "v1" }],
        };
        liftSectionOutcomes(producer);
        const wire = JSON.parse(JSON.stringify(producer));
        expect(wire.sectionOutcomes.animals.outcome).toBe("empty");
        expect(wire.animals.readState).toBeUndefined();
        updateLiveSectionBackup(state, wire, null);
        expect(state.liveSectionBackup.animals).toBeNull();
        const held = applyLiveSectionHold(wire, state, wire, null);
        expect(held.animals).toHaveLength(0);
        expect(held.stock.byFarm["1"].items[0].totalLiters).toBe(0);
        expect(state.lastGoodMergedSnapshot.animals).toHaveLength(0);
        expect(state.lastGoodMergedSnapshot.stock.byFarm["1"].items[0].totalLiters).toBe(0);
        updateLastGoodMergedSnapshot(state, held, rich);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fh007-cache-"));
        saveServerCache(dir, "local", {
            mergedSnapshot: state.lastGoodMergedSnapshot,
            sectionAge: "current",
            savedAt: new Date().toISOString(),
        });
        const disk = loadServerCache(dir, "local");
        expect(disk.mergedSnapshot.animals).toHaveLength(0);
        expect(disk.mergedSnapshot.stock.byFarm["1"].items[0].totalLiters).toBe(0);
        expect(disk.sectionAge).toBe("current");
        const reloaded = {};
        updateLiveSectionBackup(reloaded, disk.mergedSnapshot, null);
        updateLastGoodMergedSnapshot(reloaded, disk.mergedSnapshot, rich);
        const offline = buildHeldPayloadFromState(reloaded);
        expect(offline.animals).toHaveLength(0);
        expect(offline.stock.byFarm["1"].items[0].totalLiters).toBe(0);

        const disabledState = {
            lastGoodMergedSnapshot: {
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50 }] } } },
                fields: [{ id: 1, hectares: 2 }],
            },
            liveSectionBackup: {
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50 }] } } },
            },
        };
        const disabled = {
            fields: [{ id: 1, hectares: 2 }],
            stock: { enabled: false, readState: "ok", coverage: "complete", byFarm: {} },
        };
        const disabledHeld = applyLiveSectionHold(disabled, disabledState, disabled, null);
        expect(disabledHeld.stock.enabled).toBe(false);
        expect(disabledState.lastGoodMergedSnapshot.stock.enabled).toBe(false);
    });

    test("a failed section stays last-known and a legacy disable stub still holds", () => {
        const state = {
            liveSectionBackup: {
                animals: [{ animalCount: 4 }],
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50 }] } } },
            },
            lastGoodMergedSnapshot: {
                animals: [{ animalCount: 4 }],
                stock: { enabled: true, byFarm: { "1": { items: [{ totalLiters: 50 }] } } },
                fields: [{ id: 1, hectares: 2 }],
            },
        };
        const failed = {
            animals: [],
            fields: [{ id: 1, hectares: 2 }],
            stock: { enabled: false, byFarm: {} },
            sectionOutcomes: {
                animals: { outcome: "failed", readState: "failed", coverage: "partial", provider: "vanilla", sampledAt: 1000, sessionId: "s" },
            },
        };
        const held = applyLiveSectionHold(failed, state, { fields: [{ id: 1, hectares: 2 }] }, null);
        expect(held.animals[0].animalCount).toBe(4);
        expect(held.stock.byFarm["1"].items[0].totalLiters).toBe(50);
    });

    test("field retention uses field id, not a neighbour on the same farmland", () => {
        const previous = [
            { id: 1, farmlandId: 7, hectares: 2, nitrogenLevel: 20, nitrogenSampledAt: 1000 },
            { id: 2, farmlandId: 7, hectares: 3, nitrogenLevel: 80, nitrogenSampledAt: 2000 },
        ];
        const next = [{
            id: 1,
            farmlandId: 7,
            hectares: 2,
            nitrogenLevel: null,
            nitrogenReadState: "held",
            nitrogenSampledAt: null,
            phValue: 6.5,
            phReadState: "ok",
            phSampledAt: 9000,
        }];
        const merged = mergeFieldsMoistureForward(previous, next);
        expect(merged[0].nitrogenLevel).toBe(20);
        expect(merged[0].nitrogenSampledAt).toBe(1000);
        const otherCareer = mergeFieldsMoistureForward(
            [{ id: 1, careerId: "A", farmlandId: 7, hectares: 2, nitrogenLevel: 20, nitrogenSampledAt: 1000 }],
            [{ id: 1, careerId: "B", farmlandId: 7, hectares: 2, nitrogenLevel: null, nitrogenReadState: "held", nitrogenSampledAt: null }]
        );
        expect(otherCareer[0].nitrogenLevel).toBeNull();
        const ambiguous = mergeFieldsMoistureForward(
            [
                { farmlandId: 7, hectares: 2, nitrogenLevel: 20 },
                { farmlandId: 7, hectares: 3, nitrogenLevel: 80 },
            ],
            [{ farmlandId: 7, hectares: 2, nitrogenLevel: null, nitrogenReadState: "held" }]
        );
        expect(ambiguous[0].nitrogenLevel).toBeNull();
    });

    test("unknown fills stay in litres and a current nitrogen read can still match its target", () => {
        const units = productionTs("NEW APP/src/lib/fill-units.ts");
        const helpers = productionTs("NEW APP/src/sections/fields/field-helpers.ts", {
            "@/i18n/i18n": { t: (key) => key, tOr: (_key, fallback) => fallback },
            "@/lib/rules-engine": { nitrogenTargetForDisplay: (field) => Number(field.targetNitrogen) || 0, PF_NUTRIENT_CLOSE_FRAC: 0.1 },
            "@/lib/field-harvest-state": { xmlGrowthLooksHarvested: () => false },
        });
        const rules = productionTs("NEW APP/src/lib/rules-engine/rules-engine.ts", {
            "@/i18n/i18n": { t: (key) => key },
            "../field-harvest-state": { xmlGrowthLooksHarvested: () => false },
            "./forage-crop-types": { isMowableForageCrop: () => false, isPreparedSeedbedGround: () => false },
            "./cover-crop-types": { isCoverCrop: () => false },
        });
        const imperial = { present: true, liquid: "gallons", crops: "imperial", weight: "imperial" };
        expect(units.formatFillQuantity(1000, "UNKNOWN_CUSTOM_FILL", "imperial", {}, { imperial })).toBe(units.formatLitres(1000));
        expect(units.formatMixedFood(
            [{ fill: "WHEAT", liters: 500 }, { fill: "UNKNOWN_CUSTOM_FILL", liters: 500 }],
            1000,
            "british",
            {}
        )).toBe(units.formatLitres(1000));
        expect(units.formatFillQuantity(0, "WATER", "litres", {})).toContain("0");
        const held = {
            id: 7,
            isPrecisionFarming: true,
            isScanned: true,
            nitrogenLevel: 100,
            targetNitrogen: 100,
            phValue: 6.5,
            targetPh: 6.5,
            soilReadState: "partial",
            nitrogenReadState: "held",
            phReadState: "ok",
            nitrogenSampledAt: 1000,
            phSampledAt: 9000,
        };
        expect(rules.pfNitrogenWithinTolerance(held)).toBe(false);
        const reading = helpers.resolveSoilReading({ ...held, soilReadState: "pending", nitrogenReadState: "pending", phReadState: "pending" });
        expect(reading.nitrogen.reason).not.toBe("measured");
        expect(rules.pfNitrogenWithinTolerance({
            isPrecisionFarming: true,
            isScanned: true,
            nitrogenLevel: 100,
            targetNitrogen: 100,
            nitrogenReadState: "ok",
            soilReadState: "ok",
        })).toBe(true);
        expect(units.effectiveFillUnitMode(null, "imperial")).toBe("imperial");
        expect(units.effectiveFillUnitMode({
            british: false,
            imperial: { present: false, liquid: "gallons", crops: "imperial", weight: "imperial" },
        })).toBe("litres");
    });
});
