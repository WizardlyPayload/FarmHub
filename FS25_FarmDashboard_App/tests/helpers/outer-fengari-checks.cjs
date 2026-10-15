"use strict";
// Checks shared by the suites that run under outer-fengari-environment.cjs. Two suites run them, so a Fengari
// instance shared between test files, or a wrapper left on it, fails whichever of the two runs second.
const ordinary = require("fengari");

const PROBE = "__farmhubOuterFengariSuite";

function defineOuterFengariChecks(fengari, suitePath) {
    const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

    // jest-environment-node injects the host's typed arrays into the vm, so realm is judged by Function/Object.
    test("runs in the host realm, not the suite's vm realm", () => {
        expect(lauxlib.luaL_dostring instanceof Function).toBe(false);
        expect(lauxlib instanceof Object).toBe(false);
        expect(typeof lauxlib.luaL_dostring).toBe("function");
        expect(ordinary.lauxlib.luaL_dostring instanceof Function).toBe(true);
        expect(fengari).not.toBe(ordinary);
    });

    test("is private to this test file", () => {
        expect(fengari[PROBE]).toBeUndefined();
        expect(lauxlib.luaL_dostring.farmhubWrapper).toBeUndefined();
        fengari[PROBE] = suitePath;
    });

    test("instrumentation wraps and restores the instance the suite uses", () => {
        const original = lauxlib.luaL_dostring;
        let calls = 0;
        let hooks = 0;
        lauxlib.luaL_dostring = Object.assign(function (L, source) {
            calls += 1;
            lua.lua_sethook(L, () => { hooks += 1; }, lua.LUA_MASKCOUNT, 1000);
            try {
                return original(L, source);
            } finally {
                lua.lua_sethook(L, null, 0, 0);
            }
        }, { farmhubWrapper: "outer-fengari-checks" });
        try {
            const L = lauxlib.luaL_newstate();
            lualib.luaL_openlibs(L);
            const status = lauxlib.luaL_dostring(L, to_luastring("local n = 0 for i = 1, 20000 do n = n + i end return tostring(n)"));
            expect(status).toBe(lua.LUA_OK);
            expect(to_jsstring(lua.lua_tostring(L, -1))).toBe("200010000");
            lua.lua_close(L);
        } finally {
            lauxlib.luaL_dostring = original;
        }
        expect(calls).toBe(1);
        expect(hooks).toBeGreaterThan(0);
        expect(lauxlib.luaL_dostring).toBe(original);
    });
}

module.exports = { defineOuterFengariChecks, PROBE };
