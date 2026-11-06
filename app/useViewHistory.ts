"use client";

import { useCallback, useEffect, useState } from "react";

export const views = ["inicio", "producao", "notas", "clientes", "financeiro", "mais"] as const;
export type View = (typeof views)[number];

export function viewFromHash(hash: string): View {
  const value = hash.replace(/^#/, "").split("?", 1)[0];
  return views.includes(value as View) ? value as View : "inicio";
}

export function noteFromHash(hash: string) {
  if (viewFromHash(hash) !== "notas") return "";
  return new URLSearchParams(hash.split("?")[1]).get("nota") ?? "";
}

function locationFromHash(hash: string) {
  return { view: viewFromHash(hash), noteId: noteFromHash(hash) };
}

export default function useViewHistory() {
  const [location, updateLocation] = useState(() => locationFromHash(""));
  useEffect(() => {
    const restore = () => updateLocation(locationFromHash(window.location.hash));
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, []);
  const setView = useCallback((next: View, noteId?: string) => {
    const hash = next === "notas" && noteId ? `#notas?nota=${encodeURIComponent(noteId)}` : `#${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    updateLocation(locationFromHash(hash));
    window.scrollTo({ top: 0 });
  }, []);
  return [location.view, setView, location.noteId] as const;
}
