const sizes = "(?:XGG|GG|PP|G[1-9]\\d*|P|M|G)";
const shortCode = new RegExp(`^(\\d+)\\s*(?:[x×]\\s*)?(${sizes})\\s*(F|M)?(?=$|[\\s:|–—-])(?:\\s*[:|–—-]\\s*|\\s+)?(.*)$`, "i");
const onlyCodes = new RegExp(`^\\d+\\s*(?:[x×]\\s*)?${sizes}\\s*[FM]?(?:[\\s,;+]+\\d+\\s*(?:[x×]\\s*)?${sizes}\\s*[FM]?)*$`, "i");
const tokens = new RegExp(`\\d+\\s*(?:[x×]\\s*)?${sizes}\\s*[FM]?`, "gi");
const heading = /^(masculin[ao]s?|feminin[ao]s?|infantil|unissex|manga curta(?:\s*[-–—]\s*padrão)?|manga comprida|sob medida|modelo\s+.+?)(?:\s*[-–—:]\s*\d+\s*(?:unidades?|un\.?))?:?$/i;
const sizeHeading = /^(?:tamanho\s+)?(?:XGG|GG|G\d+|PP|P|M|G|\d+\s*anos?|sob medida|único)\s*(?:\(\d+\)|[-–—|:]\s*\d+\s*(?:unidades?|un\.?))?$/i;

export function expandProductionShorthand(text: string) {
  const lines = text.split(/\r?\n/).flatMap(raw => {
    const line = raw.trim().replace(/^[•\-*]+\s*/, "").replace(/\*\*/g, "");
    return onlyCodes.test(line) ? line.match(tokens)!.map(value => value.trim()) : [line];
  });
  const output: string[] = [];
  let section = "Masculina", active = section;
  let expanded = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], modelHeading = line.match(heading);
    if (modelHeading) { section = modelHeading[1]; active = section; output.push(line); continue; }
    const match = line.match(shortCode);
    if (!match) {
      if (sizeHeading.test(line) && active !== section) { output.push(section); active = section; }
      output.push(line); continue;
    }
    const quantity = Number(match[1]);
    expanded += quantity;
    if (quantity < 1 || expanded > 500) throw new Error("A lista deve ter entre 1 e 500 peças.");
    const female = match[3]?.toUpperCase() === "F";
    const model = !match[3] ? section : female ? (/^feminin/i.test(section) ? section : "Feminina") : (/^masculin/i.test(section) ? section : "Masculina");
    const names: string[] = match[4].trim() ? [match[4].trim()] : [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      if (!next) { index++; continue; }
      if (shortCode.test(next) || heading.test(next) || sizeHeading.test(next) || next.includes(":")) break;
      names.push(next.replace(/^\d+[.)]\s*/, "")); index++;
    }
    if (active !== model) output.push(model);
    output.push(`Tamanho ${match[2].toUpperCase()} (${quantity})`);
    active = model;
    output.push(...names.map(name => `- ${name}`));
    const supplied = names.reduce((sum, name) => sum + Number(name.match(/^(\d+)\s*(?:unidades?|un\.?)?\s*sem nome$/i)?.[1] ?? 1), 0);
    for (let missing = supplied; missing < quantity; missing++) output.push("- Sem nome");
  }
  return output.join("\n");
}
