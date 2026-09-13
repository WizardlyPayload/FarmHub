// Shared empty/loading/error chrome for classic web modules.
import { t } from "../i18n/i18n.js";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderUiStateHtml({
  state = "empty",
  titleKey,
  bodyKey,
  title,
  body,
  showRetry = false,
} = {}) {
  const heading = title || t(titleKey || `ux.state.${state}`);
  const copy = body || (bodyKey ? t(bodyKey) : "");
  const retry = showRetry
    ? `<button type="button" class="btn btn-farm-accent btn-sm fd-uistate-retry">${esc(t("ux.state.retry"))}</button>`
    : "";
  const skeleton =
    state === "loading"
      ? `<div class="fd-skeleton" aria-hidden="true"><div class="fd-skeleton__line"></div><div class="fd-skeleton__card"></div></div>`
      : "";
  const live = state === "loading" || state === "pending" ? "polite" : "assertive";
  const busy = state === "pending" ? ` aria-busy="true"` : "";
  return `
    <div class="fd-uistate fd-uistate--${esc(state)}" role="${state === "error" ? "alert" : "status"}" aria-live="${live}"${busy}>
      ${skeleton}
      <h4 class="fd-uistate__title">${esc(heading)}</h4>
      ${copy ? `<p class="fd-uistate__body">${esc(copy)}</p>` : ""}
      ${retry}
    </div>`;
}

export function bindUiStateRetry(root, onRetry) {
  if (!root || typeof onRetry !== "function") return;
  root.querySelectorAll(".fd-uistate-retry").forEach((btn) => {
    if (btn.dataset.fdRetryBound === "1") return;
    btn.dataset.fdRetryBound = "1";
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      onRetry();
    });
  });
}

if (typeof window !== "undefined") {
  window.farmDashUiState = { renderUiStateHtml, bindUiStateRetry };
}
