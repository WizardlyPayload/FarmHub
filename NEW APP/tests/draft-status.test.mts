import assert from "node:assert/strict";
import { resolveSetupStatusForDraft } from "../src/setup/draft-status.ts";
import type { SetupStatus } from "../src/lib/ux-state.ts";

function status(code: string | null): SetupStatus {
  return {
    status: "incomplete",
    lastErrorCode: code,
    nextAction: "add_server",
    configCompleteness: 0,
    requiresRestart: false,
    steps: [],
    recentEvents: [],
  };
}

const noSources = status("E_CONFIG_INCOMPLETE");
assert.equal(resolveSetupStatusForDraft(noSources, 0), noSources);
assert.equal(resolveSetupStatusForDraft(noSources, 2), null);

const waitingForExport = status("E_LUA_STALE");
assert.equal(resolveSetupStatusForDraft(waitingForExport, 2), waitingForExport);

const authFailure = status("E_AUTH_MISSING");
assert.equal(resolveSetupStatusForDraft(authFailure, 2), authFailure);
assert.equal(resolveSetupStatusForDraft(null, 2), null);

console.log("draft-status ok");
