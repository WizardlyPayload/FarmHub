export type RecoveryOfferView = "none" | "dialog" | "retry";

/** A dismissed offer stays reachable in this session without reopening its modal. */
export function recoveryOfferView(offerId: string | null, dismissedOfferId: string | null): RecoveryOfferView {
  if (!offerId) return "none";
  return offerId === dismissedOfferId ? "retry" : "dialog";
}

/** Reopening an offer deliberately does not start a new in-game challenge. */
export function reopenRecoveryOffer<T>(offer: T) {
  return { offer, dismissedOfferId: null, phase: "offer" as const, challengeId: null };
}
