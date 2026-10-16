import assert from "node:assert/strict";
import test from "node:test";
import { recoveryOfferView, reopenRecoveryOffer } from "../src/platform/link-server-retry.ts";
import { RecoveryPromptController } from "../src/platform/recovery-prompt-controller.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("Not now leaves the same offer accessible only through an explicit retry control", () => {
  const offer = { offerId: "offer-a", sourceId: "mp-6a677ec7f2bd", sourceSlot: "savegame1" };
  assert.equal(recoveryOfferView(offer.offerId, null), "dialog");
  assert.equal(recoveryOfferView(offer.offerId, offer.offerId), "retry");
  assert.equal(recoveryOfferView(null, offer.offerId), "none");
  assert.equal(recoveryOfferView("offer-b", offer.offerId), "dialog");

  const retry = reopenRecoveryOffer(offer);
  assert.deepEqual(retry, {
    offer,
    dismissedOfferId: null,
    phase: "offer",
    challengeId: null,
  });
  assert.equal(recoveryOfferView(retry.offer.offerId, retry.dismissedOfferId), "dialog");
  assert.equal(offer.offerId, "offer-a");
});

test("late verified poll after Cancel and retry cannot show Restore until a new explicit Check", async () => {
  const controller = new RecoveryPromptController();
  const oldEpoch = controller.beginCheck();
  assert.notEqual(oldEpoch, null);
  const oldStart = Promise.resolve({ ok: true, challengeId: "challenge-old" });
  controller.trackStart(oldEpoch!, oldStart);
  assert.deepEqual(controller.acceptStarted(oldEpoch!, await oldStart), {
    phase: "waiting", challengeId: "challenge-old",
  });
  const oldPoll = controller.beginPoll();
  const delayedPoll = deferred<{ phase: "verified"; challengeId: string }>();
  const observedPoll = delayedPoll.promise.then((value) =>
    controller.acceptPoll(oldPoll, value.phase, value.challengeId));
  const cancelDone = deferred<void>();
  const cancelledIds: Array<string | null> = [];
  const cancellation = controller.cancel(async (id) => {
    cancelledIds.push(id);
    await cancelDone.promise;
    return { ok: true };
  });
  let retryFinished = false;
  const retry = controller.retryAfterCancel().then(() => { retryFinished = true; });
  delayedPoll.resolve({ phase: "verified", challengeId: "challenge-old" });
  assert.equal(await observedPoll, null);
  await Promise.resolve();
  assert.equal(retryFinished, false);
  cancelDone.resolve(undefined);
  await cancellation;
  await retry;
  assert.deepEqual(cancelledIds, ["challenge-old"]);
  assert.deepEqual(controller.acceptPoll(controller.beginPoll(), "verified", "challenge-old"), {
    phase: "offer", challengeId: null,
  });

  const freshEpoch = controller.beginCheck();
  assert.notEqual(freshEpoch, null);
  const freshStart = Promise.resolve({ ok: true, challengeId: "challenge-new" });
  controller.trackStart(freshEpoch!, freshStart);
  assert.deepEqual(controller.acceptStarted(freshEpoch!, await freshStart), {
    phase: "waiting", challengeId: "challenge-new",
  });
  assert.deepEqual(controller.acceptPoll(controller.beginPoll(), "verified", "challenge-old"), {
    phase: "waiting", challengeId: "challenge-new",
  });
  assert.deepEqual(controller.acceptPoll(controller.beginPoll(), "verified", "challenge-new"), {
    phase: "verified", challengeId: "challenge-new",
  });
});

test("Cancel awaits a Check still in flight and retires its returned challenge ID", async () => {
  const controller = new RecoveryPromptController();
  const epoch = controller.beginCheck();
  assert.notEqual(epoch, null);
  const started = deferred<{ ok: boolean; challengeId: string }>();
  controller.trackStart(epoch!, started.promise);
  let cancelledId: string | null = null;
  const cancellation = controller.cancel(async (id) => { cancelledId = id; return { ok: true }; });
  started.resolve({ ok: true, challengeId: "late-start" });
  await cancellation;
  assert.equal(cancelledId, "late-start");
  assert.equal(controller.acceptStarted(epoch!, { ok: true, challengeId: "late-start" }), null);
  await controller.retryAfterCancel();
  assert.deepEqual(controller.acceptPoll(controller.beginPoll(), "verified", "late-start"), {
    phase: "offer", challengeId: null,
  });
});

test("offer poll sampled before Check and older out-of-order polls cannot clear the new challenge", async () => {
  const controller = new RecoveryPromptController();
  const beforeCheck = controller.beginPoll();
  const epoch = controller.beginCheck()!;
  const start = Promise.resolve({ ok: true, challengeId: "new-id" });
  controller.trackStart(epoch, start);
  controller.acceptStarted(epoch, await start);
  assert.equal(controller.acceptPoll(beforeCheck, "offer"), null);
  assert.equal(controller.activeChallengeId(), "new-id");

  const older = controller.beginPoll();
  const newer = controller.beginPoll();
  assert.deepEqual(controller.acceptPoll(newer, "verified", "new-id"), {
    phase: "verified", challengeId: "new-id",
  });
  assert.equal(controller.acceptPoll(older, "offer"), null);
  assert.equal(controller.activeChallengeId(), "new-id");
});

test("rejected Cancel blocks Check and retry until the same challenge is retired", async () => {
  const controller = new RecoveryPromptController();
  const epoch = controller.beginCheck()!;
  const start = Promise.resolve({ ok: true, challengeId: "old-id" });
  controller.trackStart(epoch, start);
  controller.acceptStarted(epoch, await start);
  const ids: Array<string | null> = [];
  let attempts = 0;
  const cancel = controller.cancel(async (id) => {
    ids.push(id);
    attempts += 1;
    return attempts === 1 ? { ok: false, error: "unavailable" } : { ok: true };
  });
  await assert.rejects(cancel, /unavailable/);
  assert.equal(controller.hasPendingCancellation(), true);
  assert.equal(controller.beginCheck(), null);
  assert.deepEqual(controller.acceptPoll(controller.beginPoll(), "verified", "old-id"), {
    phase: "offer", challengeId: null,
  });
  await controller.retryAfterCancel();
  assert.deepEqual(ids, ["old-id", "old-id"]);
  assert.equal(controller.hasPendingCancellation(), false);
  assert.notEqual(controller.beginCheck(), null);
});

test("rejected in-flight Check requires an authoritative cancellation result", async () => {
  const controller = new RecoveryPromptController();
  const epoch = controller.beginCheck()!;
  const pending = deferred<{ ok: boolean; challengeId: string }>();
  controller.trackStart(epoch, pending.promise);
  let attempts = 0;
  const cancellation = controller.cancel(async (id) => {
    assert.equal(id, null);
    attempts += 1;
    return attempts === 1 ? { ok: false, error: "uncertain" } : { alreadyRetired: true };
  });
  pending.resolve(Promise.reject(new Error("IPC rejected")) as never);
  await assert.rejects(cancellation, /uncertain/);
  assert.equal(controller.acceptStarted(epoch, { ok: true, challengeId: "ghost" }), null);
  assert.equal(controller.beginCheck(), null);
  await controller.retryAfterCancel();
  assert.equal(attempts, 2);
  assert.notEqual(controller.beginCheck(), null);
});

test("Check IPC rejection before Cancel still retires an uncertain main-process request", async () => {
  const controller = new RecoveryPromptController();
  const epoch = controller.beginCheck()!;
  const rejectedStart = Promise.reject(new Error("transport lost"));
  rejectedStart.catch(() => {});
  controller.trackStart(epoch, rejectedStart);
  await assert.rejects(rejectedStart, /transport lost/);
  const ids: Array<string | null> = [];
  await controller.cancel(async (id) => {
    ids.push(id);
    return { alreadyRetired: true };
  });
  assert.deepEqual(ids, [null]);
  assert.equal(controller.hasPendingCancellation(), false);
  assert.notEqual(controller.beginCheck(), null);
});

test("expiry and concurrent repeated retries never reuse a retired proof", async () => {
  const controller = new RecoveryPromptController();
  for (const id of ["expired-one", "expired-two"]) {
    const epoch = controller.beginCheck()!;
    const start = Promise.resolve({ ok: true, challengeId: id });
    controller.trackStart(epoch, start);
    controller.acceptStarted(epoch, await start);
    assert.deepEqual(controller.acceptPoll(controller.beginPoll(), "offer"), {
      phase: "offer", challengeId: null,
    });
    await controller.cancel(async (challengeId) => {
      assert.equal(challengeId, null);
      return { alreadyRetired: true };
    });
    const [first, second] = await Promise.all([
      controller.retryAfterCancel(), controller.retryAfterCancel(),
    ]);
    assert.equal(first, second);
    assert.deepEqual(controller.acceptPoll(controller.beginPoll(), "verified", id), {
      phase: "offer", challengeId: null,
    });
  }
});
