"use strict";
// Opt-in Jest environment (via @jest-environment docblock) for Fengari suites too heavy for the vm realm.
// Fengari reads NaN / Math / Uint8Array on every Lua call; inside Jest's vm context each of those global reads
// goes through the contextified-global interceptor and costs 35-210x more, which halves Lua throughput.
// Each test file gets its own Fengari instance loaded in the host realm; nothing is shared between files.
const path = require("path");
const { TestEnvironment } = require("jest-environment-node");

const GLOBAL_KEY = "__FARMHUB_OUTER_FENGARI";
const fengariRoot = path.dirname(require.resolve("fengari/package.json")) + path.sep;

function loadPrivateFengari() {
    const owned = (key) => key.startsWith(fengariRoot);
    const saved = Object.keys(require.cache).filter(owned).map((key) => [key, require.cache[key]]);
    for (const [key] of saved) delete require.cache[key];
    try {
        return require("fengari");
    } finally {
        for (const key of Object.keys(require.cache)) if (owned(key)) delete require.cache[key];
        for (const [key, mod] of saved) require.cache[key] = mod;
    }
}

class OuterFengariEnvironment extends TestEnvironment {
    constructor(config, context) {
        super(config, context);
        this.global[GLOBAL_KEY] = Object.freeze({ fengari: loadPrivateFengari() });
    }

    async teardown() {
        delete this.global[GLOBAL_KEY];
        await super.teardown();
    }
}

module.exports = OuterFengariEnvironment;
