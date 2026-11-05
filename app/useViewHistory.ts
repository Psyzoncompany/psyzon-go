"use client";

import { useCallback, useEffect, useState } from "react";

export const views = ["inicio", "producao", "notas", "clientes", "financeiro", "mais"] as const;
export type View = (typeof views)[number];

export function viewFromHash(hash: string): View {
  const value = hash.replace(/^#/, "");
  return views.includes(value as View) ? value as View : "inicio";
}

export default function useViewHistory() {
  const [view, updateView] = useState<View>("inicio");
  useEffect(() => {
    const restore = () => updateView(viewFromHash(window.location.hash));
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, []);
  const setView = useCallback((next: View) => {
    if (window.location.hash !== `#${next}`) window.history.pushState(null, "", `#${next}`);
    updateView(next);
    window.scrollTo({ top: 0 });
  }, []);
  return [view, setView] as const;
}
