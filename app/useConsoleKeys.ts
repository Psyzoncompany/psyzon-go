"use client";

import { useEffect } from "react";

const controls = 'button, a[href], summary, [role="button"], [role="tab"], input[type="checkbox"], input[type="radio"]';

export default function useConsoleKeys(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function navigate(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d", "enter"].includes(key) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active.isContentEditable || active.closest('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [role="textbox"]'))) return;
      if (key === "enter") {
        // Native buttons, links and summaries already activate with Enter.
        if (active instanceof HTMLElement && active.matches('[role="button"], [role="tab"], input[type="checkbox"], input[type="radio"]') && !active.matches('button,a[href],summary')) {
          event.preventDefault();
          active.click();
        }
        return;
      }
      const dialogs = [...document.querySelectorAll<HTMLElement>('dialog[open], [aria-modal="true"], [role="dialog"], .modal-backdrop')].filter(el => el.getClientRects().length);
      const scope = dialogs.at(-1) ?? document;
      const candidates = [...scope.querySelectorAll<HTMLElement>(controls)].filter(el =>
        !el.matches(':disabled,[aria-disabled="true"]') && !el.closest('[inert],[aria-hidden="true"]') &&
        el.getClientRects().length && getComputedStyle(el).visibility === "visible");
      if (!candidates.length) return;
      let next: HTMLElement | undefined;
      if (!(active instanceof HTMLElement) || !candidates.includes(active)) {
        next = candidates.find(el => el.matches('.console-launcher [aria-selected="true"]')) ??
          candidates.find(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
      } else {
        const rect = active.getBoundingClientRect();
        const horizontal = key === "a" || key === "d";
        const sign = key === "a" || key === "w" ? -1 : 1;
        let best = Infinity;
        for (const candidate of candidates) {
          const r = candidate.getBoundingClientRect();
          const dx = (r.left + r.right - rect.left - rect.right) / 2;
          const dy = (r.top + r.bottom - rect.top - rect.bottom) / 2;
          const forward = sign * (horizontal ? dx : dy);
          if (forward < 3) continue;
          const cross = Math.abs(horizontal ? dy : dx);
          const gap = horizontal ? Math.max(rect.top-r.bottom,r.top-rect.bottom,0) : Math.max(rect.left-r.right,r.left-rect.right,0);
          const score = forward + cross * .5 + gap * 5;
          if (score < best) { best = score; next = candidate; }
        }
      }
      if (next) {
        event.preventDefault();
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    document.addEventListener("keydown", navigate);
    return () => document.removeEventListener("keydown", navigate);
  }, [enabled]);
}
