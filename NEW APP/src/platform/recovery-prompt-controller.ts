export type RecoveryPromptPhase = "offer" | "waiting" | "verified";

export interface RecoveryPromptState {
  phase: RecoveryPromptPhase;
  challengeId: string | null;
}

interface ChallengeStartResult {
  ok?: boolean;
  challengeId?: string;
}

export interface RecoveryPollToken {
  generation: number;
  sequence: number;
  challengeId: string | null;
}

interface CancelResult {
  ok?: boolean;
  alreadyRetired?: boolean;
  error?: string;
}

interface Cancellation {
  challengeId: string | null;
  pendingStart: Promise<ChallengeStartResult> | null;
  operation: (challengeId: string | null) => Promise<CancelResult>;
}

/** Serializes the explicit Check/Cancel/retry flow and rejects stale IPC results. */
export class RecoveryPromptController {
  private epoch = 0;
  private pollGeneration = 0;
  private pollSequence = 0;
  private appliedPollSequence = 0;
  private challengeId: string | null = null;
  private starting = false;
  private startPromise: Promise<ChallengeStartResult> | null = null;
  private cancellation: Cancellation | null = null;
  private cancelPromise: Promise<void> | null = null;
  private retryPromise: Promise<number> | null = null;

  token(): number { return this.epoch; }
  isCurrent(token: number): boolean { return token === this.epoch; }
  activeChallengeId(): string | null { return this.challengeId; }
  hasPendingCancellation(): boolean { return this.cancellation !== null; }

  private invalidatePolls(): void {
    this.pollGeneration += 1;
    this.appliedPollSequence = this.pollSequence;
  }

  beginPoll(): RecoveryPollToken {
    return { generation: this.pollGeneration, sequence: ++this.pollSequence, challengeId: this.challengeId };
  }

  isPollCurrent(token: RecoveryPollToken): boolean {
    return token.generation === this.pollGeneration && token.sequence > this.appliedPollSequence &&
      token.challengeId === this.challengeId;
  }

  acceptNonRecoveryPoll(token: RecoveryPollToken): boolean {
    if (!this.isPollCurrent(token)) return false;
    this.appliedPollSequence = token.sequence;
    this.invalidate();
    return true;
  }

  invalidate(): void {
    this.epoch += 1;
    this.challengeId = null;
    this.starting = false;
    this.startPromise = null;
    this.invalidatePolls();
  }

  beginCheck(): number | null {
    if (this.cancellation || this.starting || this.challengeId) return null;
    this.invalidate();
    this.starting = true;
    return this.epoch;
  }

  trackStart(token: number, promise: Promise<ChallengeStartResult>): void {
    if (this.isCurrent(token) && this.starting) this.startPromise = promise;
  }

  acceptStarted(token: number, result: ChallengeStartResult): RecoveryPromptState | null {
    if (!this.isCurrent(token) || !this.starting) return null;
    this.starting = false;
    this.startPromise = null;
    this.invalidatePolls();
    if (!result.ok || !result.challengeId) return { phase: "offer", challengeId: null };
    this.challengeId = result.challengeId;
    return { phase: "waiting", challengeId: this.challengeId };
  }

  failCheck(token: number): boolean {
    if (!this.isCurrent(token)) return false;
    this.starting = false;
    this.startPromise = null;
    this.challengeId = null;
    this.invalidatePolls();
    return true;
  }

  acceptPoll(token: RecoveryPollToken, phase: RecoveryPromptPhase, reportedChallengeId?: string): RecoveryPromptState | null {
    if (!this.isPollCurrent(token)) return null;
    this.appliedPollSequence = token.sequence;
    if (this.starting) return { phase: "waiting", challengeId: null };
    if (phase === "offer") {
      this.challengeId = null;
      this.invalidatePolls();
      return { phase: "offer", challengeId: null };
    }
    if (this.challengeId && reportedChallengeId === this.challengeId) {
      return { phase, challengeId: this.challengeId };
    }
    // A proof from another challenge can never unlock Restore.
    return this.challengeId
      ? { phase: "waiting", challengeId: this.challengeId }
      : { phase: "offer", challengeId: null };
  }

  private runCancellation(): Promise<void> {
    if (this.cancelPromise) return this.cancelPromise;
    const task = this.cancellation;
    if (!task) return Promise.resolve();
    const attempt = (async () => {
      if (task.pendingStart) {
        try {
          const started = await task.pendingStart;
          if (started.ok && started.challengeId) task.challengeId = started.challengeId;
        } catch {
          // The main process may have committed despite a rejected IPC. Resolve via the operation.
        }
        task.pendingStart = null;
      }
      const result = await task.operation(task.challengeId);
      if (!result.ok && !result.alreadyRetired) throw new Error(result.error || "cancel-failed");
      this.cancellation = null;
    })();
    this.cancelPromise = attempt.finally(() => { this.cancelPromise = null; });
    return this.cancelPromise;
  }

  cancel(operation: (challengeId: string | null) => Promise<CancelResult>): Promise<void> {
    if (this.cancellation) return this.runCancellation();
    this.cancellation = { challengeId: this.challengeId, pendingStart: this.startPromise, operation };
    this.invalidate();
    return this.runCancellation();
  }

  retryAfterCancel(): Promise<number> {
    if (this.retryPromise) return this.retryPromise;
    const attempt = (async () => {
      await this.runCancellation();
      this.invalidate();
      return this.epoch;
    })();
    this.retryPromise = attempt.finally(() => { this.retryPromise = null; });
    return this.retryPromise;
  }
}
