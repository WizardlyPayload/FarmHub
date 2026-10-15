"use strict";

const fs = require("fs");
const path = require("path");

const messagesDir = path.resolve(__dirname, "../web/locales/messages");
const sourceFiles = [
    {
        path: path.resolve(__dirname, "../../NEW APP/src/sections/mods/shared/ModPage.tsx"),
        keys: ["companionPage.moistureSystem.noticeMapCropLimited"],
    },
    {
        path: path.resolve(__dirname, "../../NEW APP/src/sections/mods/moistureSystem/MoistureSystemPage.tsx"),
        keys: [
            "companionPage.moistureSystem.unavailableSilos",
            "companionPage.moistureSystem.unavailableBales",
            "companionPage.moistureSystem.unavailableJobs",
            "companionPage.moistureSystem.waitingJobs",
        ],
    },
];

test("Moisture tOr fallbacks are present in English and every locale catalog", () => {
    const english = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf8"));
    const fallbacks = new Map();

    for (const item of sourceFiles) {
        const source = fs.readFileSync(item.path, "utf8");
        const calls = new Map(
            [...source.matchAll(/\btOr\(\s*"([^"]+)"\s*,\s*("(?:\\.|[^"\\])*")/g)]
                .map((match) => [match[1], JSON.parse(match[2])]),
        );
        for (const key of item.keys) {
            expect(calls.has(key)).toBe(true);
            fallbacks.set(key, calls.get(key));
        }
    }

    for (const [key, fallback] of fallbacks) {
        expect(english[key]).toBe(fallback);
    }

    const locales = fs.readdirSync(messagesDir).filter((name) => /^[a-z]{2}\.json$/.test(name));
    for (const name of locales) {
        const messages = JSON.parse(fs.readFileSync(path.join(messagesDir, name), "utf8"));
        for (const key of fallbacks.keys()) {
            expect(typeof messages[key]).toBe("string");
            expect(messages[key].trim()).not.toBe("");
        }
    }
});
