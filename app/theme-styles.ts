import type { InterfaceAppearance } from "./interface-appearance";

type Theme = InterfaceAppearance["theme"];
const sheets = new Map<Theme, Promise<HTMLLinkElement>>();

export function loadTheme(theme: Theme) {
  if (theme === "original") return Promise.resolve(null);
  const cached = sheets.get(theme);
  if (cached) return cached;
  const loading = new Promise<HTMLLinkElement>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.media = "not all";
    link.dataset.appearanceSheet = theme;
    const version = process.env.NEXT_PUBLIC_PSYZON_BUILD || "dev";
    link.href = "/themes/" + theme + ".css?v=" + encodeURIComponent(version);
    link.onload = () => resolve(link);
    link.onerror = () => {
      link.remove();
      sheets.delete(theme);
      reject(new Error("Falha ao carregar o tema."));
    };
    document.head.append(link);
  });
  sheets.set(theme, loading);
  return loading;
}

export function enableTheme(sheet: HTMLLinkElement | null) {
  for (const link of document.querySelectorAll<HTMLLinkElement>("link[data-appearance-sheet]")) {
    link.media = link === sheet ? "screen" : "not all";
  }
}
