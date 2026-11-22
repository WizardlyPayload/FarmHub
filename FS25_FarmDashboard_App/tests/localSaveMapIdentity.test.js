"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { compareLocalSaveMap } = require("../localSaveMapIdentity.cjs");
const { statusForPayload } = require("../boundSourcePublication.cjs");

test("a reused savegame slot cannot show a previous map's export", () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "farmdash-map-identity-"));
    try {
        const dashboardRoot = path.join(profile, "modSettings", "FS25_FarmDashboard");
        const saveDir = path.join(profile, "savegame12");
        fs.mkdirSync(dashboardRoot, { recursive: true });
        fs.mkdirSync(saveDir);
        fs.writeFileSync(path.join(saveDir, "careerSavegame.xml"),
            "<careerSavegame><settings><mapId>FS25_SaddleCreek.SaddleCreek</mapId><mapTitle>Saddle Creek</mapTitle></settings></careerSavegame>");
        const source = { mode: "local", localPath: dashboardRoot, localSubFolder: "savegame12" };
        expect(compareLocalSaveMap(source, { serverInfo: { mapId: "FS25_Witcombe.SampleModMap" } })).toEqual({
            status: "mismatch",
            savedMapId: "FS25_SaddleCreek.SaddleCreek",
            exportedMapId: "FS25_Witcombe.SampleModMap",
        });
        expect(statusForPayload({ configWarning: { code: "localSaveMapMismatch" } }, { vehicles: [{ id: 1 }] })).toBe("blocked");
        expect(compareLocalSaveMap(source, { serverInfo: { mapId: "FS25_SaddleCreek.SaddleCreek" } }).status).toBe("match");
    } finally {
        fs.rmSync(profile, { recursive: true, force: true });
    }
});

test("missing map identity does not reject a valid legacy or remote reading", () => {
    expect(compareLocalSaveMap({ mode: "ftp" }, { serverInfo: { mapId: "MapUS" } }).status).toBe("unknown");
    expect(compareLocalSaveMap({ mode: "local", localPath: "C:\\wrong", localSubFolder: "../savegame12" },
        { serverInfo: { mapId: "MapUS" } }).status).toBe("unknown");
});
