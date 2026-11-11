import type { NoteMaterial } from "./notes-model";

export function forecastMaterial(material: NoteMaterial, quantity?: number): NoteMaterial {
  const baseline = material.orderQuantityBaseline;
  if (!baseline || !quantity || baseline === quantity) return material;
  const ratio = quantity / baseline;
  const fabricKg = material.fabricKg * ratio;
  const ribanaKg = material.ribanaKg * ratio;
  const poloUnits = Math.ceil(material.poloUnits * ratio);
  const fabricCost = material.fabricCost * ratio;
  const ribanaCost = material.ribanaCost * ratio;
  const poloCost = material.poloUnits ? poloUnits * (material.poloPricePerUnit ?? (material.poloCost ?? 0) / material.poloUnits) : 0;
  return { ...material, fabricKg, ribanaKg, poloUnits, fabricCost, ribanaCost, poloCost,
    totalCost: fabricCost + ribanaCost + poloCost, orderQuantityBaseline: quantity };
}

export function extraFabricKg(material: NoteMaterial, quantity?: number) {
  return Math.max(0, forecastMaterial(material, quantity).fabricKg - material.fabricKg);
}
