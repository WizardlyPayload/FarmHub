"use strict";

const fs = require("fs");
const path = require("path");

const SAVE_SLOT = /^savegame\d+$/i;
const MAP_ID = /^[A-Za-z0-9_.-]{1,160}$/;

function localCareerPath(source) {
    if (!source || source.mode !== "local" || typeof source.localPath !== "string"
        || !SAVE_SLOT.test(String(source.localSubFolder || ""))) return null;
    const dashboardRoot = path.resolve(source.localPath);
    if (path.basename(dashboardRoot).toLowerCase() !== "fs25_farmdashboard"
        || path.basename(path.dirname(dashboardRoot)).toLowerCase() !== "modsettings") return null;
    return path.join(path.dirname(path.dirname(dashboardRoot)), source.localSubFolder, "careerSavegame.xml");
}

function mapIdFromCareerFile(filePath) {
    if (!filePath) return null;
    try {
        const stat = fs.lstatSync(filePath);
        if (!stat.isFile() || stat.size < 1 || stat.size > 4 * 1024 * 1024) return null;
        const xml = fs.readFileSync(filePath, "utf8");
        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
        const value = xml.match(/<mapId>\s*([^<]+?)\s*<\/mapId>/i)?.[1]?.trim();
        return MAP_ID.test(value || "") ? value : null;
    } catch (_) {
        return null;
    }
}

function compareLocalSaveMap(source, payload) {
    const careerPath = localCareerPath(source);
    const savedMapId = mapIdFromCareerFile(careerPath);
    const exportedMapId = String(payload?.serverInfo?.mapId || "").trim();
    if (!savedMapId || !MAP_ID.test(exportedMapId)) return { status: "unknown" };
    return {
        status: savedMapId.toLowerCase() === exportedMapId.toLowerCase() ? "match" : "mismatch",
        savedMapId,
        exportedMapId,
    };
}

module.exports = { compareLocalSaveMap };
