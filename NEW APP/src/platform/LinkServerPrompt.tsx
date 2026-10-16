import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "@/i18n/i18n";
import { Button } from "@/components/ui";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { getFarmDashApi, type OrphanReplicaRecoveryOffer, type PendingReplicaSession } from "@/services/electron-bridge";
import { showToast } from "@/platform/ChangesModal";
import { recoveryOfferView, reopenRecoveryOffer } from "@/platform/link-server-retry";
import { RecoveryPromptController } from "@/platform/recovery-prompt-controller";
import { captureSourceSelectionIntent } from "@/services/source-selection-intent";
import "@/platform/platform.css";

const POLL_MS = 5000;

function errorText(error: string | undefined): string {
  switch (error) {
    case "recovery-required":
      return t("replicaLink.errorRecoveryRequired");
    case "changed":
    case "none":
    case "declined":
      return t("replicaLink.errorChanged");
    case "already-linked":
    case "linked":
      return t("replicaLink.errorAlreadyLinked");
    case "link-limit":
      return t("replicaLink.errorLinkLimit", { count: 16 });
    case "waiting":
    case "proof-required":
      return t("replicaLink.recoveryWaiting");
    case "invalid-proof":
    case "mismatch":
    case "untrusted":
      return t("replicaLink.recoveryProofFailed");
    default:
      return t("replicaLink.errorGeneric", { error: error || "unknown" });
  }
}

/**
 * "Link this server?" — shown while a joined game reports a server this PC has not linked. Nothing is stored
 * from that server until the user approves here.
 */
export function LinkServerPrompt() {
  const [session, setSession] = useState<PendingReplicaSession | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedInvalid, setDismissedInvalid] = useState(false);
  const [recovery, setRecovery] = useState<OrphanReplicaRecoveryOffer | null>(null);
  const [recoverableOffer, setRecoverableOffer] = useState<OrphanReplicaRecoveryOffer | null>(null);
  const [recoveryPhase, setRecoveryPhase] = useState<"offer" | "waiting" | "verified">("offer");
  const [recoveryChallengeId, setRecoveryChallengeId] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const recoveryController = useRef(new RecoveryPromptController());
  const latestOffer = useRef<OrphanReplicaRecoveryOffer | null>(null);
  const dismissedRecoveryRef = useRef<string | null>(null);
  const [dismissedRecoveryId, setDismissedRecoveryId] = useState<string | null>(null);

  useEffect(() => {
    const api = getFarmDashApi();
    if (!api?.getPendingReplicaSession) return;
    let alive = true;
    const poll = async () => {
      const controller = recoveryController.current;
      const pollToken = controller.beginPoll();
      try {
        const next = await api.getPendingReplicaSession!();
        if (!alive || !next || !controller.isPollCurrent(pollToken)) return;
        if (next.state === "none" && api.getOrphanReplicaRecovery) {
          const recovered = await api.getOrphanReplicaRecovery();
          if (!alive || !controller.isPollCurrent(pollToken)) return;
          const accepted = recovered.state === "none"
            ? (controller.acceptNonRecoveryPoll(pollToken) ? { phase: "offer" as const, challengeId: null } : null)
            : controller.acceptPoll(pollToken, recovered.state, recovered.challengeId);
          if (!accepted) return;
          const offered = recovered.state !== "none" ? recovered.offer : null;
          latestOffer.current = offered;
          setRecoverableOffer(offered);
          setRecovery(recoveryOfferView(offered?.offerId || null, dismissedRecoveryRef.current) === "dialog" ? offered : null);
          setRecoveryPhase(accepted.phase);
          setRecoveryChallengeId(accepted.challengeId);
          if (recovered.state !== "none" && recovered.error && accepted.phase === "offer") setError(errorText(recovered.error));
        } else {
          if (!controller.acceptNonRecoveryPoll(pollToken)) return;
          setRecovery(null);
          setRecoverableOffer(null);
          latestOffer.current = null;
          setRecoveryPhase("offer");
          setRecoveryChallengeId(null);
        }
        if (next.state === "pending") {
          setSession((prev) => (prev && prev.pendingId === next.session.pendingId ? prev : next.session));
          setInvalid(false);
        } else {
          setSession(null);
          setInvalid(next.state === "invalid");
          if (next.state !== "invalid") setDismissedInvalid(false);
        }
      } catch {
        /* desktop bridge refused or unavailable: nothing to show */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const decline = () => {
    const api = getFarmDashApi();
    if (session && api?.declinePendingReplicaSession) void api.declinePendingReplicaSession(session.pendingId);
    setSession(null);
    setError(null);
  };

  const approve = async () => {
    const api = getFarmDashApi();
    if (!session || !api?.approvePendingReplicaSession) return;
    const selectionIntent = captureSourceSelectionIntent();
    setBusy(true);
    setError(null);
    try {
      const result = await api.approvePendingReplicaSession(session.pendingId);
      if (result?.ok) {
        setSession(null);
        showToast(t("replicaLink.linked"), "info");
        const sourceId = result.sourceId;
        if (sourceId) {
          void import("@/services/ws-client")
            .then(({ selectApprovedLinkedSource }) => selectApprovedLinkedSource(sourceId, selectionIntent))
            .catch((e) => {
            console.warn("[replica-link] linked source could not be displayed yet", e);
          });
        }
      } else {
        setError(errorText(result?.error));
      }
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : undefined));
    } finally {
      setBusy(false);
    }
  };

  const cancelRecoveryRequest = async (offerId: string, challengeId: string | null) => {
    const api = getFarmDashApi();
    if (!api?.cancelOrphanReplicaChallenge || !api.getOrphanReplicaRecovery) {
      return { ok: false, error: "unavailable" };
    }
    let target = challengeId;
    if (!target) {
      const state = await api.getOrphanReplicaRecovery();
      if (state.state === "none" || (state.state === "offer" && state.offer.offerId === offerId)) {
        return { ok: true, alreadyRetired: true };
      }
      if (state.offer.offerId !== offerId || !state.challengeId) return { ok: false, error: "changed" };
      target = state.challengeId;
    }
    return api.cancelOrphanReplicaChallenge(offerId, target);
  };

  const startRecovery = async () => {
    const api = getFarmDashApi();
    if (!recovery || !api?.startOrphanReplicaChallenge) return;
    const controller = recoveryController.current;
    const epoch = controller.beginCheck();
    if (epoch === null) {
      setError(t("replicaLink.recoveryCancelFailed"));
      return;
    }
    setBusy(true);
    setError(null);
    setRecoveryPhase("waiting");
    setRecoveryChallengeId(null);
    try {
      const request = api.startOrphanReplicaChallenge(recovery.offerId);
      controller.trackStart(epoch, request);
      const result = await request;
      const accepted = controller.acceptStarted(epoch, result);
      if (!accepted) return;
      setRecoveryPhase(accepted.phase);
      setRecoveryChallengeId(accepted.challengeId);
      if (accepted.phase === "offer") setError(errorText(result?.error));
    } catch (e) {
      if (controller.isCurrent(epoch)) {
        try {
          await controller.cancel((id) => cancelRecoveryRequest(recovery.offerId, id));
          setError(errorText(e instanceof Error ? e.message : undefined));
        } catch {
          setError(t("replicaLink.recoveryCancelFailed"));
        }
        setRecoveryPhase("offer");
        setRecoveryChallengeId(null);
        setBusy(false);
      }
    } finally {
      if (controller.isCurrent(epoch)) setBusy(false);
    }
  };

  const restore = async () => {
    const api = getFarmDashApi();
    const activeId = recoveryController.current.activeChallengeId();
    if (!recovery || !activeId || activeId !== recoveryChallengeId ||
      recoveryPhase !== "verified" || !api?.restoreOrphanReplica) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.restoreOrphanReplica(recovery.offerId, activeId);
      if (result?.ok) {
        showToast(t("replicaLink.restored"), "info");
        window.location.reload();
      } else {
        if (result?.error === "expired") {
          recoveryController.current.invalidate();
          setRecoveryPhase("offer");
          setRecoveryChallengeId(null);
        }
        setError(errorText(result?.error));
      }
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : undefined));
    } finally {
      setBusy(false);
    }
  };

  const retryRecovery = async () => {
    const offer = recoverableOffer;
    if (!offer) return;
    setRetryBusy(true);
    try {
      const controller = recoveryController.current;
      const epoch = await controller.retryAfterCancel();
      if (!controller.isCurrent(epoch) || latestOffer.current?.offerId !== offer.offerId) return;
      const next = reopenRecoveryOffer(offer);
      setRecovery(next.offer);
      dismissedRecoveryRef.current = next.dismissedOfferId;
      setDismissedRecoveryId(next.dismissedOfferId);
      setRecoveryPhase(next.phase);
      setRecoveryChallengeId(next.challengeId);
      setError(null);
    } catch {
      setError(t("replicaLink.recoveryCancelFailed"));
    } finally {
      setRetryBusy(false);
    }
  };

  const showInvalid = invalid && !dismissedInvalid && !session;
  const showRecovery = !session && !showInvalid && !!recovery;
  const open = !!session || showInvalid || showRecovery;
  const showRetry = !open && recoveryOfferView(recoverableOffer?.offerId || null, dismissedRecoveryId) === "retry";
  const close = session ? decline : showRecovery ? () => {
    const offerId = recovery!.offerId;
    void recoveryController.current.cancel((id) => cancelRecoveryRequest(offerId, id))
      .catch(() => setError(t("replicaLink.recoveryCancelFailed")));
    setRecoveryChallengeId(null);
    setRecoveryPhase("offer");
    setBusy(false);
    dismissedRecoveryRef.current = recovery!.offerId;
    setDismissedRecoveryId(recovery!.offerId);
    setRecovery(null);
    setError(null);
  } : () => setDismissedInvalid(true);
  const trapRef = useFocusTrap(open, close);
  if (!open) {
    if (!showRetry || !recoverableOffer) return null;
    return (
      <div class="fd-link-server__retry">
        {error ? <p class="fd-settings__hint" role="alert">{error}</p> : null}
        <Button variant="ghost" disabled={retryBusy} onClick={() => void retryRecovery()}>
          {t("replicaLink.recoveryRetry")}
        </Button>
      </div>
    );
  }

  return (
    <div class="fd-modal-backdrop" role="presentation">
      <div
        class="fd-modal"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-link-server-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="fd-modal__header">
          <h2 id="fd-link-server-title">{showRecovery ? t("replicaLink.restoreTitle") : t("replicaLink.title")}</h2>
        </div>
        <div class="fd-modal__body">
          {session ? (
            <>
              <p>{t("replicaLink.intro")}</p>
              <dl class="fd-link-server__facts">
                <dt>{t("replicaLink.server")}</dt>
                <dd>{session.serverName || t("replicaLink.unknown")}</dd>
                <dt>{t("replicaLink.map")}</dt>
                <dd>{session.mapTitle || t("replicaLink.unknown")}</dd>
                <dt>{t("replicaLink.save")}</dt>
                <dd>{session.sourceSlot}</dd>
              </dl>
              <p class="fd-settings__hint">{t("replicaLink.renewNote")}</p>
              {error ? <p class="fd-settings__hint" role="alert">{error}</p> : null}
            </>
          ) : showRecovery ? (
            <>
              <p>{t("replicaLink.restoreIntro")}</p>
              <dl class="fd-link-server__facts">
                <dt>{t("replicaLink.source")}</dt>
                <dd>{recovery!.sourceId}</dd>
                <dt>{t("replicaLink.save")}</dt>
                <dd>{recovery!.sourceSlot}</dd>
              </dl>
              <p class="fd-settings__hint">{recoveryPhase === "verified" ? t("replicaLink.recoveryVerified") :
                recoveryPhase === "waiting" ? t("replicaLink.recoveryWaiting") : t("replicaLink.restoreNote")}</p>
              {error ? <p class="fd-settings__hint" role="alert">{error}</p> : null}
            </>
          ) : (
            <p>{t("replicaLink.invalid")}</p>
          )}
        </div>
        <div class="fd-modal__footer">
          {session ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={decline}>
                {t("replicaLink.decline")}
              </Button>
              <Button disabled={busy} onClick={() => void approve()}>
                {busy ? t("replicaLink.linking") : t("replicaLink.approve")}
              </Button>
            </>
          ) : showRecovery ? (
            <>
              <Button variant="ghost" disabled={busy} onClick={close}>{t("replicaLink.decline")}</Button>
              <Button disabled={busy || recoveryPhase === "waiting"} onClick={() => void (recoveryPhase === "verified" ? restore() : startRecovery())}>
                {busy ? t("replicaLink.restoring") : recoveryPhase === "verified" ? t("replicaLink.restoreApprove") :
                  recoveryPhase === "waiting" ? t("replicaLink.recoveryWaiting") : t("replicaLink.recoveryStart")}
              </Button>
            </>
          ) : (
            <Button onClick={close}>{t("common.close")}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
