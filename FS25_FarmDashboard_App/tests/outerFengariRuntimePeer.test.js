/**
 * @jest-environment ./tests/helpers/outer-fengari-environment.cjs
 */
"use strict";

const fengari = require("./helpers/outer-fengari.cjs");
const { defineOuterFengariChecks } = require("./helpers/outer-fengari-checks.cjs");

describe("outer-realm Fengari runtime (peer suite)", () => {
    defineOuterFengariChecks(fengari, __filename);
});
