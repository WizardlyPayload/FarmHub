"use strict";

const fengari = require("fengari");
const { PROBE } = require("./helpers/outer-fengari-checks.cjs");

describe("ordinary Fengari suites keep their own vm-realm module", () => {
    test("no host-realm instance is exposed", () => {
        expect(globalThis.__FARMHUB_OUTER_FENGARI).toBeUndefined();
        expect(() => require("./helpers/outer-fengari.cjs")).toThrow(/outer-fengari-environment/);
    });

    test("require('fengari') is this suite's own untouched module", () => {
        expect(fengari.lauxlib.luaL_dostring instanceof Function).toBe(true);
        expect(fengari[PROBE]).toBeUndefined();
        expect(fengari.lauxlib.luaL_dostring.farmhubWrapper).toBeUndefined();
    });
});
