"use client";

import { useEffect, useRef } from "react";
import type { InterfaceAppearance } from "./interface-appearance";

const revealTargets = [
  ".metric-card", ".dashboard-grid .panel", ".kanban-order-card", ".dtf-order",
  ".customer-card", ".finance-list-card", ".finance-premium-summary > article",
  ".an-note-row", ".materials-order", ".task-row", ".restock-items li",
  ".history-metrics > article", ".restock-summary > article", ".settings-card", ".appearance-settings",
].join(",");
const easeOut = "cubic-bezier(.22, 1, .36, 1)";

/** Reveal visible surfaces once, without hiding content or moving the page container. */
export default function useInterfaceMotion(view: string, ready: boolean, motion: InterfaceAppearance["motion"]) {
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = content.current;
    if (!ready || !element || motion === "reduced" || typeof element.animate !== "function" || typeof IntersectionObserver === "undefined") return;
    const root: HTMLElement = element;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const printing = window.matchMedia("print");
    const animations = new Set<Animation>();
    const seen = new WeakSet<Element>();
    let watched = new WeakSet<Element>();
    let stopped = false;

    function animate(element: HTMLElement, keyframes: Keyframe[], delay = 0) {
      const animation = element.animate(keyframes, { duration: 420, delay, easing: easeOut, fill: "backwards" });
      animations.add(animation);
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    }

    const intersection = new IntersectionObserver(entries => {
      let index = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target);
        intersection.unobserve(entry.target);
        if (stopped || preference.matches || printing.matches || document.visibilityState === "hidden") continue;
        const element = entry.target as HTMLElement;
        // A card under the pointer or keyboard focus must remain steady and immediately usable.
        if (element.matches(":hover") || element.contains(document.activeElement) || element.dataset.moving === "true") continue;
        animate(element, [{ opacity: .45, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], Math.min(index++ * 28, 112));
      }
    }, { threshold: .05 });

    function watch(element: Element) {
      const add = (target: Element) => {
        if (watched.has(target) || seen.has(target)) return;
        watched.add(target);
        intersection.observe(target);
      };
      if (element.matches(revealTargets)) add(element);
      element.querySelectorAll(revealTargets).forEach(add);
    }

    const mutations = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (!(node instanceof Element)) continue;
          intersection.unobserve(node);
          watched.delete(node);
          node.querySelectorAll(revealTargets).forEach(element => { intersection.unobserve(element); watched.delete(element); });
        }
        for (const node of record.addedNodes) if (node instanceof Element) watch(node);
      }
    });

    function stop() {
      stopped = true;
      intersection.disconnect();
      mutations.disconnect();
      animations.forEach(animation => animation.cancel());
      animations.clear();
    }

    function resume() {
      if (preference.matches || printing.matches) { stop(); return; }
      stopped = false;
      watched = new WeakSet<Element>();
      watch(root);
      mutations.observe(root, { childList: true, subtree: true });
    }

    function settleInteraction(event: Event) {
      if (!(event.target instanceof Element)) return;
      for (const animation of animations) {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (target instanceof Element && target.contains(event.target)) animation.cancel();
      }
    }

    resume();
    // Opacity alone preserves fixed windows and sticky controls inside every workspace.
    if (!stopped && !document.documentElement.dataset.pageTransition) {
      animate(root, [{ opacity: .08 }, { opacity: 1 }]);
    }
    preference.addEventListener("change", resume);
    printing.addEventListener("change", resume);
    window.addEventListener("beforeprint", stop);
    window.addEventListener("afterprint", resume);
    root.addEventListener("pointerdown", settleInteraction, { capture: true, passive: true });
    root.addEventListener("focusin", settleInteraction);
    return () => {
      stop();
      preference.removeEventListener("change", resume);
      printing.removeEventListener("change", resume);
      window.removeEventListener("beforeprint", stop);
      window.removeEventListener("afterprint", resume);
      root.removeEventListener("pointerdown", settleInteraction, true);
      root.removeEventListener("focusin", settleInteraction);
    };
  }, [view, ready, motion]);
  return content;
}
