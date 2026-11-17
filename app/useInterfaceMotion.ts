"use client";

import { useLayoutEffect, useRef } from "react";
import type { InterfaceAppearance } from "./interface-appearance";
import { contentAnimationMs } from "./animation-timing";

const revealTargets = [
  "[data-reveal-card]",
  ".metric-card", ".panel", ".kanban-order-card", ".dtf-order",
  ".customer-card", ".finance-list-card", ".finance-premium-summary > article",
  ".an-note-row", ".materials-order", ".task-row", ".restock-items li",
  ".history-metrics > article", ".restock-summary > article", ".settings-card", ".appearance-settings", ".appearance-option",
  ".materials-totals", ".sewing-summary > article", ".finance-row",
].join(",");
const easeOut = "cubic-bezier(.22, 1, .36, 1)";

/** Reveal each card on entry; navigation and page containers stay fixed. */
export default function useInterfaceMotion(view: string, ready: boolean, motion: InterfaceAppearance["motion"]) {
  const content = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = content.current;
    if (!ready || !element || motion === "reduced" || typeof element.animate !== "function" || typeof IntersectionObserver === "undefined") return;
    const root: HTMLElement = element;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const printing = window.matchMedia("print");
    const animations = new Set<Animation>();
    const prepared = new Set<HTMLElement>();
    const seen = new WeakSet<Element>();
    let watched = new WeakSet<Element>();
    let stopped = false;

    function reveal(element: HTMLElement) {
      prepared.delete(element);
      delete element.dataset.cardReveal;
    }

    function animate(element: HTMLElement, keyframes: Keyframe[], delay = 0, duration = contentAnimationMs) {
      if (prepared.has(element)) element.dataset.cardReveal = "revealing";
      try {
        const animation = element.animate(keyframes, { duration, delay, easing: easeOut, fill: "backwards" });
        animations.add(animation);
        const finish = () => { animations.delete(animation); reveal(element); };
        animation.finished.then(finish, finish);
      } catch { reveal(element); }
    }

    const intersection = new IntersectionObserver(entries => {
      let index = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target);
        intersection.unobserve(entry.target);
        const element = entry.target as HTMLElement;
        if (stopped || preference.matches || printing.matches || document.visibilityState === "hidden") { reveal(element); continue; }
        // A card under the pointer or keyboard focus must remain steady and immediately usable.
        if (element.matches(":hover") || element.contains(document.activeElement) || element.dataset.moving === "true" || element.parentElement?.closest('[data-card-reveal="pending"],[data-card-reveal="revealing"]')) { reveal(element); continue; }
        // Move cards with independent properties so a reveal never overwrites a
        // row's swipe transform or changes the positioning of its children.
        animate(element, [
          { opacity: 0, translate: "0 18px", scale: ".98", offset: 0 },
          { opacity: 1, translate: "0 -1px", scale: "1", offset: .72 },
          { opacity: 1, translate: "0 0", scale: "1", offset: 1 },
        ], Math.min(index++ * 65, 260));
      }
    }, { threshold: 0, rootMargin: "0px 0px -16px 0px" });

    function watch(element: Element) {
      const add = (target: Element) => {
        if (!(target instanceof HTMLElement) || watched.has(target) || seen.has(target)) return;
        watched.add(target);
        if (!preference.matches && !printing.matches) {
          prepared.add(target);
          target.dataset.cardReveal = "pending";
        }
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
          for (const target of prepared) if (node.contains(target)) reveal(target);
          for (const animation of animations) {
            const target = (animation.effect as KeyframeEffect | null)?.target;
            if (target instanceof Element && node.contains(target)) animation.cancel();
          }
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
      prepared.forEach(reveal);
    }

    function visibilityChanged() {
      // Never resume an offscreen entrance halfway through after switching apps.
      if (document.hidden) stop();
      else resume();
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
      const active = event.target;
      for (const target of prepared) if (target.contains(active)) {
        seen.add(target); intersection.unobserve(target); reveal(target);
      }
      for (const animation of animations) {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (target instanceof Element && target.contains(event.target)) animation.cancel();
      }
    }

    resume();
    // Opacity alone preserves fixed windows and sticky controls inside every workspace.
    if (!stopped && !document.documentElement.dataset.pageTransition) {
      animate(root, [{ opacity: .65 }, { opacity: 1 }], 0, 240);
    }
    preference.addEventListener("change", resume);
    printing.addEventListener("change", resume);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("beforeprint", stop);
    window.addEventListener("afterprint", resume);
    root.addEventListener("pointerdown", settleInteraction, { capture: true, passive: true });
    root.addEventListener("focusin", settleInteraction);
    return () => {
      stop();
      preference.removeEventListener("change", resume);
      printing.removeEventListener("change", resume);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("beforeprint", stop);
      window.removeEventListener("afterprint", resume);
      root.removeEventListener("pointerdown", settleInteraction, true);
      root.removeEventListener("focusin", settleInteraction);
    };
  }, [view, ready, motion]);
  return content;
}
