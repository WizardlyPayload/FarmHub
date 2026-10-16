import { tOr } from "@/i18n/i18n";
import { actionCopyKey, errorCopyKey, type SetupStatus } from "@/lib/ux-state";

export function SetupStatusNotice({ status }: { status: SetupStatus | null | undefined }) {
  if (!status?.lastErrorCode) return null;
  const detail = status.nextStep
    ? status.nextStep
    : `${tOr(errorCopyKey(status.lastErrorCode), status.lastErrorCode)} ${
        status.nextAction && status.nextAction !== "none"
          ? tOr(actionCopyKey(status.nextAction), status.nextAction)
          : ""
      }`.trim();
  return (
    <p class="fd-settings__hint" role="status">
      {detail}
    </p>
  );
}
