/**
 * Default FarmHub release folder (installer, latest.yml, mod zip copies).
 * Override: set env FARMDASH_BUILD_OUTPUT to an absolute path.
 */
import path from 'node:path';
import os from 'node:os';

export function getFarmDashBuildOutputDir() {
    const env = process.env.FARMDASH_BUILD_OUTPUT;
    if (env && String(env).trim()) {
        return path.resolve(String(env).trim());
    }
    return path.join(os.homedir(), 'Documents', 'FarmDash Final Output');
}
