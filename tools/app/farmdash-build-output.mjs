/**
 * Drop folders for installers and mod zips (outside the git workspace).
 * Override either path with FARMDASH_BUILD_OUTPUT (absolute).
 *
 * V5 zip + Setup.exe always land flat in Documents\FarmDash Release
 * (no dated candidate folders, no nested V5\ unless that env path already
 * has a V4 latest.yml that must not be mixed with V5).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function farmDashReleaseDir() {
    return path.join(os.homedir(), 'Documents', 'FarmDash Release');
}

export function farmDashFinalOutputDir() {
    return path.join(os.homedir(), 'Documents', 'FarmDash Final Output');
}

export function getFarmDashBuildOutputDir() {
    const env = process.env.FARMDASH_BUILD_OUTPUT;
    if (env && String(env).trim()) {
        return path.resolve(String(env).trim());
    }
    return farmDashFinalOutputDir();
}

export function getFarmDashV5BuildOutputDir() {
    const env = process.env.FARMDASH_BUILD_OUTPUT;
    if (env && String(env).trim()) {
        const base = path.resolve(String(env).trim());
        if (fs.existsSync(path.join(base, 'latest.yml'))) {
            return path.join(base, 'V5');
        }
        return base;
    }
    return farmDashReleaseDir();
}
