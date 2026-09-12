import { useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus trap + Escape for modal dialogs. Restores focus on unmount. */
export function useFocusTrap(active: boolean, onEscape: () => void): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const prev = document.activeElement as HTMLElement | null;
    const list = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
    const first = list()[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        escapeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = list();
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && idx <= 0) {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (!e.shiftKey && idx === items.length - 1) {
        e.preventDefault();
        items[0]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [active]);

  return ref;
}
