'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function stagingPath(base) {
    return String(base) + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex');
}

/** A failed rename never requires deleting the destination. Keep staged bytes on commit failure. */
async function downloadAndCommit(client, remotePath, localTmp, localFinal, options = {}) {
    const attempts = Math.min(10, Math.max(1, parseInt(options.maxAttempts, 10) || 1));
    const retryMs = Math.max(0, Number(options.retryDelayMs) || 0);
    const current = () => typeof options.canCommit !== 'function' || options.canCommit();
    const tmp = stagingPath(localTmp);
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (!current()) return false;
        let validated = false;
        try {
            await fs.promises.mkdir(path.dirname(tmp), { recursive: true });
            await client.downloadTo(tmp, remotePath);
            const stat = await fs.promises.stat(tmp);
            if (!stat.isFile() || stat.size <= 0) throw new Error('empty download');
            if (/\.json$/i.test(localFinal)) {
                JSON.parse((await fs.promises.readFile(tmp, 'utf8')).replace(/^\uFEFF/, ''));
            }
            if (typeof options.validate === 'function') await options.validate(tmp);
            validated = true;
            if (!current()) {
                await fs.promises.unlink(tmp).catch(() => {});
                return false;
            }
            await fs.promises.rename(tmp, localFinal);
            return true;
        } catch (error) {
            lastError = error;
            if (!validated) await fs.promises.unlink(tmp).catch(() => {});
        }
        if (attempt + 1 < attempts && current() && retryMs > 0) {
            await new Promise(resolve => setTimeout(resolve, retryMs * (attempt + 1)));
        }
    }
    if (options.logFailures && lastError) {
        console.warn('[fileCommit] ' + path.basename(localFinal) + ': ' + lastError.message);
    }
    return false;
}

/** Synchronous callers fail promptly; no main-thread spin and no delete-then-rename fallback. */
function writeJsonAtomicSync(destination, value) {
    const tmp = stagingPath(destination + '.tmp');
    try {
        const body = JSON.stringify(value, null, 2);
        if (typeof body !== 'string') return false;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(tmp, body, { encoding: 'utf8', flag: 'wx' });
        fs.renameSync(tmp, destination);
        return true;
    } catch (error) {
        console.warn('[fileCommit] ' + path.basename(destination) + ': ' + error.message);
        return false;
    }
}

module.exports = { downloadAndCommit, writeJsonAtomicSync };

