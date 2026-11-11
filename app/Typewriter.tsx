"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

// Only the mask changes. Inputs, accessible text and the editor's selection stay native.
function prepareText(element: HTMLElement, segmenter: Intl.Segmenter) {
  const input = element instanceof HTMLInputElement ? element : null;
  const text = input ? input.value : element.textContent ?? "";
  if (!text.trim()) return;
  const segments = segmenter.segment(text);
  const range = document.createRange();
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const pen = input ? document.createElement("canvas").getContext("2d") : null;
  if (input && !pen) return;
  if (pen) {
    const style = getComputedStyle(element);
    pen.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(" ");
    pen.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
  }
  let previous = -1;
  function reveal(fraction: number) {
    const index = Math.min(text.length - 1, Math.floor(fraction * text.length));
    const glyph = segments.containing(index);
    if (!glyph || glyph.index === previous) return;
    previous = glyph.index;
    let end = glyph.index + glyph.segment.length;
    if (pen) {
      element.style.setProperty("--typed-x", (pen.measureText(text.slice(0, end)).width + 1) + "px");
      return;
    }
    for (const node of nodes) {
      if (end > node.length) { end -= node.length; continue; }
      range.setStart(node, Math.max(0, end - glyph.segment.length));
      range.setEnd(node, end);
      const glyphBox = range.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      // Convert screen coordinates to local mask coordinates, including interface zoom.
      const x = (glyphBox.right - box.left) * element.offsetWidth / box.width;
      const y = (glyphBox.top - box.top) * element.offsetHeight / box.height;
      const bottom = (glyphBox.bottom - box.top) * element.offsetHeight / box.height;
      element.style.setProperty("--typed-x", Math.max(0, x) + "px");
      element.style.setProperty("--typed-y", Math.max(0, y) + "px");
      element.style.setProperty("--typed-bottom", Math.max(0, bottom) + "px");
      return;
    }
  }
  return { element, reveal, weight: Math.min(150, text.length), unchanged: () => (input ? input.value : element.textContent) === text };
}

export function useTypewriter(ref: RefObject<HTMLElement | null>, opening: string | null) {
  useLayoutEffect(() => {
    const root = ref.current;
    const media = matchMedia("screen and (prefers-reduced-motion: no-preference)");
    if (!root || !opening || !media.matches || document.documentElement.dataset.glassMotion !== "full" ||
        typeof Intl.Segmenter !== "function" || !CSS.supports("mask-size", "100% 0px, 0px 100%")) return;
    const targets = root.tagName === "H1" ? [root] : root.querySelectorAll<HTMLElement>(".an-title,.an-editable");
    const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
    const items: NonNullable<ReturnType<typeof prepareText>>[] = [];
    const viewport = root.getBoundingClientRect();
    for (const target of targets) {
      const box = target.getBoundingClientRect();
      if (!box.height || box.bottom <= Math.max(0, viewport.top)) continue;
      if (box.top >= Math.min(innerHeight, viewport.bottom)) break;
      if (target.contains(document.activeElement)) return;
      const item = prepareText(target, segmenter);
      if (item) items.push(item);
    }
    if (!items.length) return;
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    const duration = Math.min(1350, Math.max(340, total * 29));
    const start = performance.now() + (document.documentElement.dataset.pageTransition ? 160 : 35);
    items.forEach(({ element }) => { element.dataset.typing = ""; });
    let frame = 0;
    const listeners = new AbortController();
    function finish() {
      if (listeners.signal.aborted) return;
      listeners.abort();
      cancelAnimationFrame(frame);
      for (const { element } of items) {
        delete element.dataset.typing;
        for (const property of ["--typed-x", "--typed-y", "--typed-bottom"]) element.style.removeProperty(property);
      }
    }
    function tick(now: number) {
      let position = (now - start) * total / duration;
      if (position >= total || !media.matches || document.documentElement.dataset.glassMotion !== "full") { finish(); return; }
      for (const item of items) {
        if (position < 0) break;
        if (!item.unchanged()) { finish(); return; }
        if (position < item.weight) { item.reveal(position / item.weight); break; }
        delete item.element.dataset.typing;
        position -= item.weight;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    const interactions = ["pointerdown", "focusin", "beforeinput", "compositionstart"];
    for (const event of interactions) root.addEventListener(event, finish, { capture: true, signal: listeners.signal });
    window.addEventListener("beforeprint", finish, { signal: listeners.signal });
    media.addEventListener("change", finish, { signal: listeners.signal });
    return finish;
  }, [ref, opening]);
}

export function TypedHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useTypewriter(ref, children);
  return <h1 ref={ref}>{children}</h1>;
}
