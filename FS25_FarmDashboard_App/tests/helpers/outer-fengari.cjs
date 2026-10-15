"use strict";
// Fengari for suites that declare: @jest-environment ./tests/helpers/outer-fengari-environment.cjs
const holder = globalThis.__FARMHUB_OUTER_FENGARI;
if (!holder || !holder.fengari) {
    throw new Error("outer-fengari.cjs requires @jest-environment ./tests/helpers/outer-fengari-environment.cjs");
}

module.exports = holder.fengari;
