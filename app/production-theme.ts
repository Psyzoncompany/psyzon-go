const swatches = [
  ["Preta", "#18181b", "preta|preto"],
  ["Branca", "#ffffff", "branca|branco"],
  ["Off-white", "#f1e9d9", "off white|creme"],
  ["Azul-marinho", "#172b4d", "azul marinho|marinho"],
  ["Azul-royal", "#204dc5", "azul royal|royal"],
  ["Azul-claro", "#85b9ea", "azul claro|azul bebe|azul celeste"],
  ["Azul-petróleo", "#175065", "azul petroleo"],
  ["Azul", "#2864bb", "azul"],
  ["Vermelha", "#bd252e", "vermelha|vermelho"],
  ["Vinho", "#7e2545", "vinho|bordo|marsala"],
  ["Verde-musgo", "#485c39", "verde musgo|verde militar|verde oliva"],
  ["Verde-claro", "#88c991", "verde claro|verde menta"],
  ["Verde", "#237448", "verde"],
  ["Amarela", "#edc02e", "amarela|amarelo"],
  ["Laranja", "#e87722", "laranja"],
  ["Rosa", "#df679f", "rosa|pink"],
  ["Roxa", "#743c9b", "roxa|roxo"],
  ["Lilás", "#b58bd6", "lilas|lavanda"],
  ["Chumbo", "#484e59", "cinza chumbo|chumbo|grafite"],
  ["Cinza", "#9097a0", "cinza mescla|cinza|mescla"],
  ["Bege", "#dac39f", "bege|areia"],
  ["Marrom", "#805638", "marrom|castanho"],
] as const;

export const defaultProductionColor = "#142b55";
type ShirtColor = { label: string; hex: string };
const byName = new Map<string, ShirtColor>();
for (const [label, hex, aliases] of swatches) {
  for (const alias of aliases.split("|")) byName.set(alias, { label, hex });
}
const colorPattern = new RegExp(`#[0-9a-f]{6}\\b|\\b(?:${[...byName.keys()].sort((a, b) => b.length - a.length).join("|")})s?\\b`, "g");
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export const validProductionColor = (value: string | undefined): value is `#${string}` => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function uniqueColor(texts: string[]) {
  const found = new Map<string, ShirtColor>();
  for (const text of texts) {
    const description = normalize(text).replace(/[-–—]/g, " ").replace(/\s+/g, " ").split(/\b(?:com estampa|com gola|estampa|gola|logo)\b/, 1)[0];
    for (const [word] of description.matchAll(colorPattern)) {
      const color = validProductionColor(word) ? { hex: word, label: word.toUpperCase() } : byName.get(word) ?? byName.get(word.slice(0, -1));
      if (color) found.set(color.hex, color);
    }
  }
  return found.size === 1 ? found.values().next().value : undefined;
}

export function productionColorFromNotes(text: string) {
  const lines = normalize(text).split(/\r?\n/).map(line => line.replace(/^[#*•\s-]+|\*+/g, "").trim());
  const labels = lines.flatMap(line => line.match(/^(?:cor(?: d[ao]s? (?:camisas?|camisetas?|pecas?|malha|tecido))?|malha|tecido)\s*:\s*(.+)$/)?.[1] ?? []);
  return labels.length ? uniqueColor(labels) : uniqueColor(lines.filter(line => /^(?:camisas?|camisetas?|blusas?|uniformes?)\b/.test(line)));
}

export function productionColorFromProduct(product: string) {
  return uniqueColor([product]);
}

export function productionColorInk(hex: string) {
  const channels = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 > 0.179 ? "#000000" : "#ffffff";
}
