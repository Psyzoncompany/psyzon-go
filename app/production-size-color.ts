import type { CSSProperties } from "react";

// Stable across models, columns and pages, including sizes typed by the user.
export function productionSizeColor(size: string): CSSProperties {
  const key = size.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase()
    .replace(/^TAMANHO\s+/, "").replace(/\s+/g, " ");
  const hues: Record<string, number> = { PP: 175, P: 215, M: 145, G: 38, GG: 280, XGG: 305, G1: 330, G2: 185, G3: 15,
    PENDENTE: 225, "A CONFIRMAR": 225, "A DEFINIR": 225, "SEM TAMANHO": 225 };
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { "--size-hue": hues[key] ?? hash % 360 } as CSSProperties;
}
