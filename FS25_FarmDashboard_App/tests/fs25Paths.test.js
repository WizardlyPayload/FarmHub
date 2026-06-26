// FS25 FarmDashboard | tests/fs25Paths.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    readModsDirectoryOverride,
    looksLikeModsDirectory,
    scoreModsDirectory,
    resolveModsDirectoryCandidatesForRoot,
} = require('../fs25Paths');

function mkTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('fs25Paths mods directory resolution', () => {
    test('readModsDirectoryOverride reads attribute and element forms', () => {
        const root = mkTempDir('fd-gs-');
        const collection = mkTempDir('fd-coll-');
        fs.writeFileSync(
            path.join(root, 'gameSettings.xml'),
            `<gameSettings modsDirectoryOverride="${collection.replace(/\\/g, '/')}" />`,
            'utf8'
        );
        expect(readModsDirectoryOverride(root)).toBe(path.normalize(collection));

        fs.writeFileSync(
            path.join(root, 'gameSettings.xml'),
            `<gameSettings><modsDirectoryOverride>${collection}</modsDirectoryOverride></gameSettings>`,
            'utf8'
        );
        expect(readModsDirectoryOverride(root)).toBe(path.normalize(collection));
    });

    test('looksLikeModsDirectory detects zips and unpacked mods', () => {
        const empty = mkTempDir('fd-empty-');
        expect(looksLikeModsDirectory(empty)).toBe(false);

        const withZip = mkTempDir('fd-zip-');
        fs.writeFileSync(path.join(withZip, 'FS25_Test.zip'), 'fake', 'utf8');
        expect(looksLikeModsDirectory(withZip)).toBe(true);

        const unpacked = mkTempDir('fd-unpacked-');
        const modFolder = path.join(unpacked, 'FS25_SomeMod');
        fs.mkdirSync(modFolder);
        fs.writeFileSync(path.join(modFolder, 'modDesc.xml'), '<modDesc />', 'utf8');
        expect(looksLikeModsDirectory(unpacked)).toBe(true);
    });

    test('resolveModsDirectoryCandidatesForRoot lists override before default mods', () => {
        const root = mkTempDir('fd-fs25-');
        const defaultMods = path.join(root, 'mods');
        const collection = mkTempDir('fd-active-');
        fs.mkdirSync(defaultMods, { recursive: true });
        fs.writeFileSync(path.join(collection, 'FS25_Tractor.zip'), 'fake', 'utf8');
        fs.writeFileSync(
            path.join(root, 'gameSettings.xml'),
            `<gameSettings modsDirectoryOverride="${collection.replace(/\\/g, '/')}" />`,
            'utf8'
        );

        const candidates = resolveModsDirectoryCandidatesForRoot(root);
        expect(candidates[0]).toBe(path.normalize(collection));
        expect(candidates[1]).toBe(path.normalize(defaultMods));
        expect(scoreModsDirectory(collection)).toBeGreaterThan(scoreModsDirectory(defaultMods));
    });

    test('resolveModsDirectoryCandidatesForRoot treats FSG collection root as mods folder', () => {
        const collection = mkTempDir('fd-fsg-');
        fs.writeFileSync(path.join(collection, 'FS25_A.zip'), 'fake', 'utf8');
        const candidates = resolveModsDirectoryCandidatesForRoot(collection);
        expect(candidates).toEqual([path.normalize(collection)]);
    });
});
