"use strict";

const { runtimeRestartSignature } = require("./setupConfigMerge.cjs");

function createScope() {
    let generation = 0;
    let state = {
        generation: 0,
        phase: "idle",
        desiredSignature: null,
        appliedSignature: null,
        error: null,
    };
    let sourcesBound = false;
    let sourceRows = Object.create(null);
    let readyContinuation = null;
    let continuationRan = false;
    let startupConfigured = false;
    let startupSettled = false;

    function resetSources() {
        sourcesBound = false;
        sourceRows = Object.create(null);
        readyContinuation = null;
        continuationRan = false;
        startupConfigured = false;
        startupSettled = false;
    }

    function allArmed() {
        const rows = Object.keys(sourceRows);
        return rows.every((id) => sourceRows[id].status === "armed");
    }

    function anyBlocked() {
        return Object.keys(sourceRows).some((id) => sourceRows[id].status === "blocked");
    }

    function anyFailed() {
        return Object.keys(sourceRows).some((id) => sourceRows[id].status === "failed");
    }

    function runContinuationOnce() {
        if (continuationRan || typeof readyContinuation !== "function") return false;
        continuationRan = true;
        try {
            readyContinuation();
        } catch (error) {
            console.error("[bootServer] optional warmup failed:", error);
        }
        return true;
    }

    function reduce() {
        if (!sourcesBound || !startupConfigured || !startupSettled) {
            return Object.assign(snapshot(), { readyTransition: false });
        }
        const blocked = anyBlocked();
        const failed = anyFailed();
        const ready = allArmed() && !blocked && !failed;
        if (ready && state.phase === "starting") {
            state.phase = "applied";
            state.appliedSignature = state.desiredSignature;
            state.error = null;
            const readyTransition = runContinuationOnce();
            return Object.assign(snapshot(), { readyTransition });
        }
        if (!ready && state.phase === "applied") {
            state.phase = "starting";
            state.appliedSignature = null;
        }
        if (failed && state.phase === "starting") {
            state.phase = "failed";
            state.appliedSignature = null;
            if (!state.error) state.error = "service-start-failed";
        }
        return Object.assign(snapshot(), { readyTransition: false });
    }

    function signatureOf(config) {
        return runtimeRestartSignature(config);
    }

    function preview(config) {
        const signature = signatureOf(config);
        if (state.phase === "applied" && state.appliedSignature === signature) {
            return { action: "noop", phase: state.phase, generation: state.generation, signature };
        }
        if (state.phase === "starting" && state.desiredSignature === signature) {
            return { action: "share", phase: state.phase, generation: state.generation, signature };
        }
        return { action: "start", phase: state.phase, generation: state.generation, signature };
    }

    function begin(config) {
        const decision = preview(config);
        if (decision.action !== "start") return decision;
        generation += 1;
        resetSources();
        state = {
            generation,
            phase: "starting",
            desiredSignature: decision.signature,
            appliedSignature: null,
            error: null,
        };
        return { action: "start", phase: "starting", generation, signature: decision.signature };
    }

    function owns(token) {
        return state.phase === "starting" && state.generation === token;
    }

    function matches(token) {
        return state.generation === token;
    }

    function complete(token) {
        if (!matches(token)) return false;
        if (state.phase !== "starting" && state.phase !== "applied") return false;
        if (sourcesBound && !allArmed()) return false;
        if (anyBlocked()) return false;
        if (sourcesBound && (!startupConfigured || !startupSettled)) return false;
        if (state.phase === "applied") return true;
        state.phase = "applied";
        state.appliedSignature = state.desiredSignature;
        state.error = null;
        return true;
    }

    function fail(token, error) {
        if (!owns(token)) return false;
        state.phase = "failed";
        state.appliedSignature = null;
        state.error = error && error.message ? error.message : (error || "activation-failed");
        return true;
    }

    function block(token) {
        if (!matches(token)) return false;
        if (state.phase !== "starting" && state.phase !== "blocked") return false;
        state.phase = "blocked";
        state.appliedSignature = null;
        state.error = "activation-blocked";
        return true;
    }

    function bindSources(token, rows) {
        if (!matches(token)) return false;
        sourcesBound = true;
        sourceRows = Object.create(null);
        for (const row of rows || []) {
            sourceRows[String(row.id)] = {
                status: row.status || "pending",
                attempt: 0,
            };
        }
        reduce();
        return true;
    }

    function noteSource(token, sourceId, attempt, status) {
        if (!matches(token) || !sourcesBound) return Object.assign(snapshot(), { readyTransition: false });
        const row = sourceRows[String(sourceId)];
        if (!row || row.status === "blocked") return reduce();
        if (typeof attempt === "number" && attempt < row.attempt) return Object.assign(snapshot(), { readyTransition: false });
        if (typeof attempt === "number") row.attempt = attempt;
        row.status = status;
        if (status === "failed" && state.phase !== "applied") state.error = "service-start-failed";
        return reduce();
    }

    function setReadyContinuation(token, fn) {
        if (!matches(token)) return false;
        if (continuationRan) return true;
        readyContinuation = fn;
        startupConfigured = true;
        reduce();
        return true;
    }

    function settleStartup(token) {
        if (!matches(token)) return Object.assign(snapshot(), { readyTransition: false });
        startupSettled = true;
        return reduce();
    }

    function syncAggregate(token) {
        if (!matches(token)) return Object.assign(snapshot(), { readyTransition: false });
        return reduce();
    }

    function markUnapplied(config) {
        generation += 1;
        resetSources();
        state = {
            generation,
            phase: "failed",
            desiredSignature: signatureOf(config),
            appliedSignature: null,
            error: "activation-unapplied",
        };
        return snapshot();
    }

    function snapshot() {
        return {
            generation: state.generation,
            phase: state.phase,
            desiredSignature: state.desiredSignature,
            appliedSignature: state.appliedSignature,
            applied: state.phase === "applied",
            error: state.error,
        };
    }

    return {
        signatureOf, preview, begin, owns, matches, complete, fail, block, markUnapplied, snapshot,
        bindSources, noteSource, setReadyContinuation, settleStartup, syncAggregate,
    };
}

module.exports = createScope();
module.exports.createScope = createScope;
