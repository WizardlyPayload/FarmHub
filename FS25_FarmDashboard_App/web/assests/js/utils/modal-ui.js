/** Remove orphan Bootstrap backdrops when no modal is open (prevents dimmed frozen UI). */
export function releaseStuckModalUi() {
  if (document.querySelector(".modal.show")) return;
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.classList.remove("modal-open");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
}

/** Modals inside <main> cannot stack above the navbar; reparent to body before show. */
export function ensureModalOnBody(el) {
  if (el && el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
  return el;
}

/** Safe show: single instance, body stacking, backdrop cleanup on close. */
export function showFarmDashModal(el) {
  if (!el || typeof bootstrap === "undefined" || !bootstrap.Modal) return null;
  ensureModalOnBody(el);
  releaseStuckModalUi();
  const modal = bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener("hidden.bs.modal", releaseStuckModalUi, { once: true });
  modal.show();
  return modal;
}
