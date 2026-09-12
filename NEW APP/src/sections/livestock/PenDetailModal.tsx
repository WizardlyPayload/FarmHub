import { useEffect, useState } from "preact/hooks";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { t, tOr } from "@/i18n/i18n";
import { Badge, Button } from "@/components/ui";
import {
  bustPenDetailCache,
  formatUnixTime,
  isPenDetailStale,
  loadPenDetail,
  requestPenRefresh,
} from "@/lib/pen-detail";
import type { PenDetailAnimal, PenDetailEnvelope } from "@/lib/livestock-types";

interface Props {
  penId: string;
  serverId: string | null;
  onClose: () => void;
}

const PER_PAGE = 50;

function PenAnimalsTable({ animals, mode }: { animals: PenDetailAnimal[]; mode?: string }) {
  if (!animals.length) {
    return <p class="fd-livestock__placeholder">{tOr("livestock.noAnimals", "No animals in this pen.")}</p>;
  }
  const shown = animals.slice(0, PER_PAGE);
  const more = animals.length - shown.length;
  return (
    <>
      <div class="fd-livestock__table-wrap" style={{ maxHeight: "50vh" }}>
        <table class="fd-livestock__table">
          <thead>
            <tr>
              <th class="no-sort">{tOr("livestock.colId", "ID")}</th>
              <th class="no-sort">{tOr("livestock.colType", "Type")}</th>
              <th class="no-sort">{tOr("livestock.colGender", "Gender")}</th>
              <th class="no-sort">{tOr("livestock.colAge", "Age")}</th>
              <th class="no-sort">{tOr("livestock.colWeight", "Weight")}</th>
              <th class="no-sort">{tOr("livestock.colHealth", "Health")}</th>
              <th class="no-sort">{tOr("livestock.colFlags", "Flags")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a, i) => {
              const earTag = a.uniqueId ?? a.tag ?? a.id ?? i + 1;
              const rowKey = a.id != null ? String(a.id) : `${String(earTag)}:${i}`;
              return (
                <tr key={rowKey}>
                  <td>
                    <code>{String(earTag)}</code>
                  </td>
                  <td>{String(a.subType || a.type || "?")}</td>
                  <td>{String(a.gender || "?")}</td>
                  <td>{String(a.age ?? a.ageInMonths ?? "?")}</td>
                  <td>{String(a.weight ?? "?")}</td>
                  <td>{String(a.health ?? "?")}</td>
                  <td>
                    <span class="fd-livestock__chips">
                      {a.isPregnant ? <Badge tone="warn">P</Badge> : null}
                      {a.isLactating ? <Badge tone="accent">L</Badge> : null}
                      {a.isCastrated ? <Badge>C</Badge> : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {more > 0 ? (
        <p class="fd-livestock__status">{t("livestock.morePagedHint", { count: more })}</p>
      ) : null}
      <p class="fd-livestock__status">
        {tOr("livestock.modeLabel", "Mode")}: {mode || "?"}
      </p>
    </>
  );
}

export function PenDetailModal({ penId, serverId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [envelope, setEnvelope] = useState<PenDetailEnvelope | null>(null);

  const load = async (bust = false) => {
    setLoading(true);
    if (bust) bustPenDetailCache(penId);
    void requestPenRefresh(penId, { serverId }).catch(() => false);
    const env = await loadPenDetail(penId, { serverId });
    setEnvelope(env);
    setLoading(false);
  };

  useEffect(() => {
    void load(false);
  }, [penId, serverId]);

  const stale = isPenDetailStale(envelope);
  const animals = envelope?.detail?.animals ?? [];
  const trapRef = useFocusTrap(true, onClose);

  return (
    <div class="fd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        class="fd-modal"
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pen-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="fd-modal__header">
          <h3 id="pen-detail-title">
            {tOr("livestock.penDetailTitle", "Pen detail")} — #{penId}{" "}
            {stale ? <Badge tone="warn">{tOr("livestock.stale", "Stale")}</Badge> : null}
          </h3>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>

        {envelope?.detail ? (
          <div class="fd-modal__meta">
            <span>
              {tOr("livestock.serverTime", "Server time")}:{" "}
              {formatUnixTime(envelope.serverTimeSec) || t("common.notAvailable")}
            </span>
            <span>
              {tOr("livestock.cachedAt", "Cached at")}:{" "}
              {formatUnixTime(envelope.cachedAt) || t("common.notAvailable")}
            </span>
            <span>
              {tOr("livestock.modeLabel", "Mode")}: {envelope.animalMode || "?"}
            </span>
            <span>
              {tOr("livestock.idSchemeLabel", "ID scheme")}: {envelope.idScheme || "integer-v1"}
            </span>
          </div>
        ) : null}

        {loading ? (
          <p class="fd-livestock__placeholder">{tOr("livestock.detailLoading", "Loading pen detail.")}</p>
        ) : envelope?.detail ? (
          <PenAnimalsTable
            animals={animals}
            mode={envelope.detail.mode || envelope.animalMode}
          />
        ) : (
          <p class="fd-livestock__placeholder">
            {tOr(
              "livestock.detailUnavailable",
              "Detail not available yet. Click Refresh, then wait for the next mod export cycle (about one minute)."
            )}
          </p>
        )}

        <div class="fd-modal__footer">
          <Button
            variant="ghost"
            onClick={() => {
              void load(true);
            }}
          >
            {tOr("common.refresh", "Refresh")}
          </Button>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </div>
      </div>
    </div>
  );
}
