// Shared by the shorthand expander and the full parser so a heading always ends a name group.
export const productionSizeHeadingPattern = /^(?:tamanho\s*:?\s*)?(XGG|GG|G\d+|PP|P|M|G|\d+\s*anos?|sob medida|[úu]nico|pendente|a\s+(?:confirmar|definir)|sem\s+tamanho)\s*(?:\((\d+)\s*(?:unidades?|un\.?)?\)|[-–—|:]\s*(\d+)\s*(?:unidades?|un\.?)?)?\s*:?$/i;

export function productionHeadingSize(value: string) {
  return /^(?:pendente|a\s+(?:confirmar|definir)|sem\s+tamanho)$/i.test(value) ? "Pendente" : value.toLocaleUpperCase("pt-BR");
}
