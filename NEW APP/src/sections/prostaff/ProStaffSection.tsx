import { t, tOr } from "@/i18n/i18n";
import { Badge, Card } from "@/components/ui";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  discountPercentOff,
  getProStaff,
  getProStaffForFarm,
  proStaffFlagLabelKey,
} from "@/lib/realisticFarming/life";
import "@/sections/economy/economy.css";

export function ProStaffSection() {
  const payload = useDashboardStore((s) => s.payload);
  const farmId = useDashboardStore((s) => s.activeFarmId) ?? 1;
  const rf = payload?.realisticFarming;
  const block = getProStaff(rf);

  if (!block) {
    return (
      <div class="fd-economy__empty">
        <h2>{t("nav.mod.prostaff")}</h2>
        <p>{tOr("rf.prostaff.hintDisabled", "Pro Staff Co-Op is not detected on this save.")}</p>
      </div>
    );
  }

  const farm = getProStaffForFarm(rf, farmId);
  if (!farm) {
    return (
      <div class="fd-economy__empty">
        <h2>{t("nav.mod.prostaff")}</h2>
        <p>{tOr("rf.prostaff.hintEmpty", "No Pro Staff data for this farm yet.")}</p>
      </div>
    );
  }

  const discounts = Array.isArray(farm.discounts) ? farm.discounts : [];
  const flags = Array.isArray(farm.flags) ? farm.flags : [];
  const membership =
    farm.membershipActive === false
      ? tOr("rf.prostaff.membershipOff", "Inactive")
      : tOr("rf.prostaff.membershipOn", "Active");

  return (
    <div>
      <header class="fd-economy__header">
        <h2>{t("nav.mod.prostaff")}</h2>
        <p class="fd-economy__muted">
          {tOr("rf.prostaff.lead", "Co-Op level, discounts, and unlock flags for the selected farm.")}
        </p>
      </header>

      <div class="fd-economy__stats">
        <div>
          <span class="fd-economy__muted">{tOr("rf.prostaff.level", "Level")}</span>
          <strong>{Number(farm.level) || 0}</strong>
        </div>
        <div>
          <span class="fd-economy__muted">{tOr("rf.prostaff.membership", "Membership")}</span>
          <Badge tone={farm.membershipActive === false ? "danger" : "accent"}>{membership}</Badge>
        </div>
        <div>
          <span class="fd-economy__muted">{tOr("rf.prostaff.investment", "Investment")}</span>
          <strong>
            {farm.investmentTotal != null
              ? tOr("rf.prostaff.investmentValue", "{{amount}}", {
                  amount: Math.round(Number(farm.investmentTotal) || 0).toLocaleString(),
                })
              : "—"}
          </strong>
        </div>
      </div>

      <Card title={tOr("rf.prostaff.discountsTitle", "Active discounts")}>
        {discounts.length === 0 ? (
          <p class="fd-economy__muted">{tOr("rf.prostaff.noDiscounts", "No discount modifiers above neutral.")}</p>
        ) : (
          <div class="fd-economy__table-wrap">
            <table class="fd-economy__table">
              <thead>
                <tr>
                  <th>{tOr("rf.prostaff.colDiscount", "Discount")}</th>
                  <th>{tOr("rf.prostaff.colValue", "Modifier")}</th>
                  <th>{tOr("rf.prostaff.colOff", "Approx. off")}</th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => {
                  const off = discountPercentOff(d.value);
                  return (
                    <tr key={d.id}>
                      <td>{d.label || d.id}</td>
                      <td>{d.value != null ? Number(d.value).toFixed(3) : "—"}</td>
                      <td>{off != null ? `${off}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={tOr("rf.prostaff.flagsTitle", "Unlock flags")}>
        {flags.length === 0 ? (
          <p class="fd-economy__muted">{tOr("rf.prostaff.noFlags", "No feature flags unlocked yet.")}</p>
        ) : (
          <div class="fd-economy__stats">
            {flags.map((flag) => {
              const key = proStaffFlagLabelKey(flag);
              return (
                <Badge key={flag} tone="accent">
                  {key ? t(key) : flag}
                </Badge>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
