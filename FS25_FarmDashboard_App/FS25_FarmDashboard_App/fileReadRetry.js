// Small sync read retries for Windows + OneDrive / AV locks on XML and JSON.

const fs = require('fs');

function sleepSync(ms) {
    const n = Math.max(0, Math.min(Number(ms) || 0, 5000));
    if (n === 0) return;
    try {
        const sab = new SharedArrayBuffer(4);
        Atomics.wait(new Int32Array(sab), 0, 0, n);
    } catch {
        const end = Date.now() + n;
        while (Date.now() < end) { /* sync fallback */ }
    }
}

function shouldRetryRead(err) {
    if (!err || !err.code) return false;
    return ['EBUSY', 'EPERM', 'EACCES', 'ETXTBSY'].includes(err.code);
}

/**
 * Read UTF-8 file with short retries (OneDrive sync / transient locks).
 * @param {string} filePath
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [opts]
 * @returns {string|null} null if missing or unreadable after retries
 */
function readFileUtf8WithRetry(filePath, opts = {}) {
    const maxAttempts = Math.max(1, Math.min(parseInt(opts.maxAttempts, 10) || 5, 12));
    const baseDelayMs = Math.max(10, Math.min(parseInt(opts.baseDelayMs, 10) || 60, 500));
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (!fs.existsSync(filePath)) return null;
            return fs.readFileSync(filePath, 'utf8');
        } catch (e) {
            lastErr = e;
            const code = e && e.code;
            if (code === 'ENOENT') return null;
            if (!shouldRetryRead(e) || attempt >= maxAttempts) break;
            sleepSync(baseDelayMs * attempt);
        }
    }
    if (lastErr && lastErr.message) {
        console.warn(`[readFileUtf8WithRetry] ${filePath}: ${lastErr.message}`);
    }
    return null;
}

module.exports = {
    readFileUtf8WithRetry,
};
