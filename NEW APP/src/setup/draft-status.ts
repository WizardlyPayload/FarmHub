import type { SetupStatus } from "../lib/ux-state";

export function resolveSetupStatusForDraft(
  status: SetupStatus | null,
  draftServerCount: number,
): SetupStatus | null {
  if (draftServerCount > 0 && status?.lastErrorCode === "E_CONFIG_INCOMPLETE") {
    return null;
  }
  return status;
}
