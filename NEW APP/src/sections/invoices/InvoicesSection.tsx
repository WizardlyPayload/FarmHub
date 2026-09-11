import { t } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import { normalizeFarmInfoList } from "@/lib/farm-scope";
import {
  formatInvoiceMoney,
  getInvoicesForFarm,
  invoiceDisplayState,
  invoiceRecipientFarmId,
  invoiceSenderFarmId,
  invoiceStateTone,
  invoiceTotalDue,
  isInvoicesModActive,
  type InvoiceDisplayState,
  type InvoiceItem,
  type InvoicesPayload,
  type NormalizedInvoicesFarm,
} from "@/lib/invoices";
import "@/sections/economy/economy.css";

function farmLabel(farmInfo: unknown, farmId: number): string {
  if (!farmId) return "—";
  for (const f of normalizeFarmInfoList(farmInfo)) {
    const id = Number(f.id ?? f.farmId);
    if (id === farmId) {
      const name = String(f.name ?? "").trim();
      if (name) return t("invoices.farmNamed", { id: farmId, name });
      break;
    }
  }
  return t("invoices.farmLabel", { id: farmId });
}

function stateLabel(state: InvoiceDisplayState): string {
  switch (state) {
    case "paid":
      return t("invoices.state.paid");
    case "overdue":
      return t("invoices.state.overdue");
    case "unpaid":
      return t("invoices.state.unpaid");
    case "cancelled":
      return t("invoices.state.cancelled");
    case "sent":
      return t("invoices.state.sent");
    default:
      return t("invoices.state.unknown");
  }
}

function formatInvoiceDate(item: InvoiceItem): string {
  const at = item.createdAt;
  if (!at || typeof at !== "object") return "—";
  const day = Number(at.day) || 0;
  const period = Number(at.period) || 0;
  const year = Number(at.year) || 0;
  const hour = Number(at.hour) || 0;
  const minute = Number(at.minute) || 0;
  if (year > 0 && period > 0) {
    return t("invoices.dateFull", {
      day,
      period,
      year,
      hour: String(hour).padStart(2, "0"),
      minute: String(minute).padStart(2, "0"),
    });
  }
  if (day > 0) {
    return t("invoices.dateLegacy", {
      day,
      hour: String(hour).padStart(2, "0"),
      minute: String(minute).padStart(2, "0"),
    });
  }
  return "—";
}

function InvoiceTable({
  items,
  farmInfo,
  emptyKey,
}: {
  items: InvoiceItem[];
  farmInfo: unknown;
  emptyKey: string;
}) {
  if (items.length === 0) {
    return <p class="fd-economy__muted">{t(emptyKey)}</p>;
  }

  return (
    <div class="fd-economy__table-wrap">
      <table class="fd-economy__table">
        <thead>
          <tr>
            <th>{t("invoices.colId")}</th>
            <th>{t("invoices.colFrom")}</th>
            <th>{t("invoices.colTo")}</th>
            <th>{t("invoices.colState")}</th>
            <th>{t("invoices.colDate")}</th>
            <th class="text-end">{t("invoices.colTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const fromId = invoiceSenderFarmId(item);
            const toId = invoiceRecipientFarmId(item);
            const display = invoiceDisplayState(item);
            const idLabel =
              item.id != null && String(item.id).trim() !== ""
                ? t("invoices.idLabel", { id: item.id })
                : "—";
            return (
              <tr key={`${item.id ?? "row"}-${i}`}>
                <td>{idLabel}</td>
                <td>{farmLabel(farmInfo, fromId)}</td>
                <td>{farmLabel(farmInfo, toId)}</td>
                <td>
                  <Badge tone={invoiceStateTone(display)}>{stateLabel(display)}</Badge>
                </td>
                <td>{formatInvoiceDate(item)}</td>
                <td class="text-end">{formatInvoiceMoney(invoiceTotalDue(item))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesFarmPanel({
  farm,
  farmId,
  farmInfo,
}: {
  farm: NormalizedInvoicesFarm;
  farmId: number;
  farmInfo: unknown;
}) {
  const { summary, incoming, outgoing } = farm;

  return (
    <div>
      <p class="fd-economy__muted">{t("invoices.subtitleFarm", { farmId })}</p>
      <div class="fd-economy__stats">
        <div>
          <span class="fd-economy__muted">{t("invoices.statIncoming")}</span>
          <strong>
            {Number(summary.incomingCount) || 0} · {formatInvoiceMoney(summary.incomingTotal)}
          </strong>
        </div>
        <div>
          <span class="fd-economy__muted">{t("invoices.statOutgoing")}</span>
          <strong>
            {Number(summary.outgoingCount) || 0} · {formatInvoiceMoney(summary.outgoingTotal)}
          </strong>
        </div>
        <div>
          <span class="fd-economy__muted">{t("invoices.statUnpaid")}</span>
          <strong>
            {Number(summary.unpaidCount) || 0} · {formatInvoiceMoney(summary.unpaidTotal)}
          </strong>
        </div>
        <div>
          <span class="fd-economy__muted">{t("invoices.statOverdue")}</span>
          <strong>{Number(summary.overdueCount) || 0}</strong>
        </div>
      </div>

      <div class="fd-economy__schemes">
        <Card title={t("invoices.incomingTitle")}>
          <InvoiceTable items={incoming} farmInfo={farmInfo} emptyKey="invoices.incomingEmpty" />
        </Card>
        <Card title={t("invoices.outgoingTitle")}>
          <InvoiceTable items={outgoing} farmInfo={farmInfo} emptyKey="invoices.outgoingEmpty" />
        </Card>
      </div>
    </div>
  );
}

export function InvoicesSection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  const farmInfo = payload?.farmInfo;

  if (!payload || payload.error) {
    return (
      <div class="fd-economy">
        <header class="fd-section-header">
          <h2>{t("invoices.title")}</h2>
          <p class="fd-muted-sm">{t("invoices.hintDisabled")}</p>
        </header>
      </div>
    );
  }

  const invoices = payload.invoices as InvoicesPayload | null | undefined;

  if (!isInvoicesModActive(invoices)) {
    return (
      <div class="fd-economy">
        <header class="fd-section-header">
          <h2>{t("invoices.title")}</h2>
        </header>
        <div class="fd-economy__empty">
          <h3>{t("invoices.subtitleDisabled")}</h3>
          <p>{t("invoices.hintDisabled")}</p>
        </div>
      </div>
    );
  }

  const farm = getInvoicesForFarm(invoices, farmId);
  const byFarm = invoices?.byFarm;
  const waitingFirstCollect =
    !byFarm ||
    (Array.isArray(byFarm)
      ? byFarm.length === 0
      : Object.keys(byFarm as object).length === 0);

  return (
    <div class="fd-economy">
      <header class="fd-section-header">
        <h2>{t("invoices.title")}</h2>
        <p class="fd-muted-sm">
          {waitingFirstCollect ? t("invoices.hintWaiting") : t("invoices.subtitle")}
        </p>
      </header>
      {!farm ? (
        <div class="fd-economy__empty">{t("invoices.subtitleEmpty")}</div>
      ) : (
        <InvoicesFarmPanel farm={farm} farmId={farmId} farmInfo={farmInfo} />
      )}
    </div>
  );
}
