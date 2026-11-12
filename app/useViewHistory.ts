"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

export const views = ["inicio", "producao", "dtf", "notas", "materiais", "afazeres", "reposicao", "costureiras", "clientes", "financeiro", "historico", "mais", "ai"] as const;
export type View = (typeof views)[number];

export function viewFromHash(hash: string): View {
  const value = hash.replace(/^#/, "").split("?", 1)[0];
  if (value === "pedidos" || value === "orcamentos") return "producao";
  return views.includes(value as View) ? value as View : "inicio";
}

export function noteFromHash(hash: string) {
  if (viewFromHash(hash) !== "notas") return "";
  return new URLSearchParams(hash.split("?")[1]).get("nota") ?? "";
}

function locationFromHash(hash: string) {
  const view = viewFromHash(hash);
  const dtfCustomerId = view === "dtf" ? new URLSearchParams(hash.split("?")[1]).get("cliente") ?? "" : "";
  return { view, noteId: noteFromHash(hash), dtfCustomerId };
}

export default function useViewHistory() {
  const [location, updateLocation] = useState(() => locationFromHash(""));
  const requestedView = useRef(location.view);
  const requestedHash = useRef<string | undefined>(undefined);
  const transition = useRef<ViewTransition | null>(null);
  const revision = useRef(0);
  const navigate = useCallback((hash: string, scroll: boolean) => {
    const next = locationFromHash(hash);
    const previous = requestedView.current;
    requestedView.current = next.view;
    requestedHash.current = hash;
    const ticket = ++revision.current;
    transition.current?.skipTransition();
    const root = document.documentElement;
    const apply = () => {
      updateLocation(next);
      if (scroll) window.scrollTo({ top: 0 });
    };
    if (previous === next.view || !document.startViewTransition || matchMedia("(max-width: 760px)").matches ||
        !document.querySelector(".main > .content") || document.hidden ||
        root.dataset.glassMotion !== "full" || !matchMedia("screen and (prefers-reduced-motion: no-preference)").matches) {
      apply();
      return;
    }
    root.dataset.pageTransition = views.indexOf(next.view) < views.indexOf(previous) ? "back" : "forward";
    const active = document.startViewTransition(() => {
      if (ticket === revision.current) flushSync(apply);
    });
    transition.current = active;
    void active.ready.catch(() => {}); // A second navigation can skip the first snapshot.
    active.finished.finally(() => {
      if (transition.current === active) {
        transition.current = null;
        delete root.dataset.pageTransition;
      }
    }).catch(() => {});
  }, []);
  useEffect(() => {
    // A hash navigation can dispatch both popstate and hashchange.
    const restore = () => {
      const hash = window.location.hash;
      if (hash !== requestedHash.current) navigate(hash, false);
    };
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, [navigate]);
  const setView = useCallback((next: View, id?: string) => {
    const key = next === "notas" ? "nota" : next === "dtf" ? "cliente" : "";
    const hash = key && id ? `#${next}?${key}=${encodeURIComponent(id)}` : `#${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    navigate(hash, true);
  }, [navigate]);
  return [location.view, setView, location.noteId, location.dtfCustomerId] as const;
}
