"use client";
import { useState } from "react";
import { Calculator, Plus, Settings2, X } from "lucide-react";
import { calculateMaterial, currency, decimal, makeId, type NoteMaterial } from "../notes-model";

type Profile = { yieldPerKg: string; ribanaPercent: string; fabricPrice: string; ribanaPrice: string; poloPrice: string };
const defaults: Profile = { yieldPerKg: "4.2", ribanaPercent: "5", fabricPrice: "43.90", ribanaPrice: "53", poloPrice: "2.50" };
function loadProfile(uid: string, supplier: string, fabric: string): Profile {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(`psyzon:material:${uid}:${supplier}:${fabric}`) || "{}") }; } catch { return defaults; }
}
export default function MaterialCalculator({ uid, material, initialQuantity, close, add }: { uid: string; material?: NoteMaterial; initialQuantity?: number; close: () => void; add: (material: NoteMaterial) => void }) {
  const [supplier, setSupplier] = useState(material?.supplier || "Costa Rica");
  const [fabricType, setFabricType] = useState<NoteMaterial["fabricType"]>(material?.fabricType || "PV");
  const [profile, setProfile] = useState<Profile>(() => material ? { yieldPerKg: String(material.yieldPerKg ?? 4.2), ribanaPercent: String(material.ribanaPercent ?? 5), fabricPrice: String(material.fabricPricePerKg ?? (material.fabricKg ? material.fabricCost / material.fabricKg : 43.9)), ribanaPrice: String(material.ribanaPricePerKg), poloPrice: String(material.poloPricePerUnit ?? 2.5) } : loadProfile(uid, "Costa Rica", "PV"));
  const [color, setColor] = useState(material?.color || "");
  const [collarType, setCollarType] = useState<NoteMaterial["collarType"]>(material?.collarType || "common");
  const [sameColor, setSameColor] = useState(!material || !material.collarColor || material.collarColor === material.color);
  const [collarColor, setCollarColor] = useState(material?.collarColor || "");
  const [mode, setMode] = useState<"pieces" | "kg">(material ? "kg" : "pieces");
  const [quantity, setQuantity] = useState(String(material?.fabricKg ?? initialQuantity ?? ""));
  const [ribanaOverride, setRibanaOverride] = useState(material ? String(material.ribanaKg) : "");
  const [poloQuantity, setPoloQuantity] = useState(material?.collarType === "polo" ? String(material.poloUnits) : "");
  const [waste, setWaste] = useState("0");
  const [settings, setSettings] = useState(!!material);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"fabric" | "general">("fabric");
  const [expression, setExpression] = useState("");
  const [answer, setAnswer] = useState("");
  const numeric = (v: string) => v.trim() ? Number(v.replace(",", ".")) : NaN;
  let result: ReturnType<typeof calculateMaterial> | undefined, error = "";
  try {
    result = calculateMaterial({ mode, quantity: numeric(quantity), yieldPerKg: numeric(profile.yieldPerKg), waste: numeric(waste), ribanaPercent: numeric(profile.ribanaPercent), fabricPrice: numeric(profile.fabricPrice), ribanaPrice: numeric(profile.ribanaPrice), poloPrice: numeric(profile.poloPrice), collarType, ...(poloQuantity !== "" ? { poloQuantity: numeric(poloQuantity) } : {}) });
    if (ribanaOverride !== "" && collarType === "common") {
      const kg = numeric(ribanaOverride);
      if (!Number.isFinite(kg) || kg < 0) throw new Error("Informe uma quantidade válida de ribana.");
      result.ribanaKg = kg; result.ribanaCost = kg * numeric(profile.ribanaPrice);
      result.total = result.fabricCost + result.ribanaCost + result.poloCost;
      result.perPiece = result.pieces ? result.total / result.pieces : 0;
    }
  } catch (e) { error = quantity.trim() ? (e as Error).message : ""; }
  const save = () => {
    if (!result || !color.trim() || !supplier.trim() || (!sameColor && !collarColor.trim())) return;
    add({ id: material?.id || makeId(), supplier: supplier.trim(), fabricType, color: color.trim(), collarColor: sameColor ? color.trim() : collarColor.trim(), collarType, fabricKg: result.kg, fabricPricePerKg: numeric(profile.fabricPrice), fabricCost: result.fabricCost, ribanaKg: result.ribanaKg, ribanaPricePerKg: numeric(profile.ribanaPrice), ribanaCost: result.ribanaCost, poloUnits: result.poloUnits, poloPricePerUnit: numeric(profile.poloPrice), poloCost: result.poloCost, totalCost: result.total, yieldPerKg: numeric(profile.yieldPerKg), ribanaPercent: numeric(profile.ribanaPercent) });
  };
  const changeProfile = (nextSupplier: string, nextFabric: NoteMaterial["fabricType"]) => { setSupplier(nextSupplier); setFabricType(nextFabric); if (!material) setProfile(loadProfile(uid, nextSupplier, nextFabric)); };
  return <aside className="an-calculator" aria-label={material ? "Editar material" : "Calculadora da confecção"}>
    <header><div><Calculator size={18} /><b>{material ? "Editar material" : "Calculadora"}</b></div><button className="an-icon" onClick={close} aria-label="Fechar calculadora"><X size={20} /></button></header>
    <div className="an-segment"><button aria-pressed={tab === "fabric"} onClick={() => setTab("fabric")}>Tecido e peças</button><button aria-pressed={tab === "general"} onClick={() => setTab("general")}>Conta rápida</button></div>
    {tab === "fabric" ? <form className="an-calc-body" onSubmit={e => { e.preventDefault(); save(); }}>
      <p className="an-help">Calcule os materiais do pedido e confira os valores antes de adicionar.</p>
      <label>Fornecedor<input aria-label="Fornecedor" list="an-suppliers" maxLength={120} value={supplier} onChange={e => changeProfile(e.target.value, fabricType)} required /><datalist id="an-suppliers"><option>Costa Rica</option><option>Atual Têxtil</option></datalist></label>
      <div className="an-form-row"><label>Tipo de malha<select value={fabricType} onChange={e => changeProfile(supplier, e.target.value as NoteMaterial["fabricType"])}>{["PV", "PP", "PIQUET", "Algodão", "Dry Fit"].map(v => <option key={v}>{v}</option>)}</select></label><label>Cor da malha<input placeholder="Ex.: Azul royal" maxLength={100} value={color} onChange={e => setColor(e.target.value)} required /></label></div>
      <div className="an-segment"><button type="button" aria-pressed={mode === "pieces"} onClick={() => { setMode("pieces"); setQuantity(""); }}>Quero produzir</button><button type="button" aria-pressed={mode === "kg"} onClick={() => { setMode("kg"); setQuantity(""); }}>Tenho tecido</button></div>
      <div className="an-form-row"><label>{mode === "pieces" ? "Quantidade de camisas" : "Quantidade de tecido (kg)"}<input type="number" min={mode === "pieces" ? 1 : 0.001} step={mode === "pieces" ? 1 : "any"} value={quantity} onChange={e => setQuantity(e.target.value)} required /></label><label>Perda de tecido (%)<input type="number" min="0" max="99" step="any" value={waste} onChange={e => setWaste(e.target.value)} required /></label></div>
      <label>Tipo de gola<select value={collarType} onChange={e => setCollarType(e.target.value as NoteMaterial["collarType"])}><option value="common">Gola comum · ribana</option><option value="polo">Gola polo + punho</option></select></label>
      <label className="an-check-label"><input type="checkbox" checked={sameColor} onChange={e => setSameColor(e.target.checked)} /> Gola e punho da mesma cor da malha</label>
      {!sameColor && <label>Cor da gola e do punho<input maxLength={100} value={collarColor} onChange={e => setCollarColor(e.target.value)} required /></label>}
      {collarType === "polo" ? <label>Quantidade de conjuntos (gola + punho)<input type="number" min="0" step="1" placeholder={String(result?.pieces ?? 0)} value={poloQuantity} onChange={e => setPoloQuantity(e.target.value)} /><small>Deixe vazio para acompanhar a quantidade de camisas.</small></label> : <label>Quantidade de ribana (kg) · opcional<input type="number" min="0" step="any" placeholder={decimal(result?.ribanaKg ?? 0)} value={ribanaOverride} onChange={e => setRibanaOverride(e.target.value)} /><small>Deixe vazio para usar o percentual configurado.</small></label>}
      <button className="an-settings" type="button" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings2 size={16} /> Rendimento e preços <span>{settings ? "Ocultar" : "Configurar"}</span></button>
      {settings && <div className="an-profile-settings"><div className="an-form-row"><label>Camisas por kg<input type="number" min="0.01" step="any" value={profile.yieldPerKg} onChange={e => setProfile({ ...profile, yieldPerKg: e.target.value })} required /></label><label>Ribana (% da malha)<input type="number" min="0" max="100" step="any" value={profile.ribanaPercent} onChange={e => setProfile({ ...profile, ribanaPercent: e.target.value })} required /></label></div><label>Malha por kg (R$)<input type="number" min="0" step="any" value={profile.fabricPrice} onChange={e => setProfile({ ...profile, fabricPrice: e.target.value })} required /></label><div className="an-form-row"><label>Ribana por kg (R$)<input type="number" min="0" step="any" value={profile.ribanaPrice} onChange={e => setProfile({ ...profile, ribanaPrice: e.target.value })} required /></label><label>Conjunto polo (R$)<input type="number" min="0" step="any" value={profile.poloPrice} onChange={e => setProfile({ ...profile, poloPrice: e.target.value })} required /></label></div><button type="button" className="an-link" disabled={!result || !supplier.trim()} onClick={() => { try { localStorage.setItem(`psyzon:material:${uid}:${supplier}:${fabricType}`, JSON.stringify(profile)); setNotice("Padrão salvo neste navegador para este fornecedor e tecido."); } catch { setNotice("Não foi possível guardar o padrão neste navegador."); } }}>Salvar como padrão</button><small>4,2 camisas/kg e 5% de ribana são referências iniciais. Ajuste conforme o tecido, tamanho e modelo.</small>{notice && <p role="status">{notice}</p>}</div>}
      {error ? <p className="an-error" role="alert">{error}</p> : result && <div className="an-calc-result"><small>{mode === "pieces" ? "TECIDO NECESSÁRIO" : "PRODUÇÃO ESTIMADA"}</small><strong>{mode === "pieces" ? `${decimal(result.kg)} kg` : `${result.pieces} camisas`}</strong><dl><div><dt>Malha</dt><dd>{currency(result.fabricCost)}</dd></div><div><dt>{collarType === "common" ? `Ribana · ${decimal(result.ribanaKg)} kg` : `Gola + punho · ${result.poloUnits} conjuntos`}</dt><dd>{currency(result.ribanaCost + result.poloCost)}</dd></div><div><dt>Material por camisa</dt><dd>{currency(result.perPiece)}</dd></div><div className="total"><dt>Total de materiais</dt><dd>{currency(result.total)}</dd></div></dl><p className="an-help">Estimativa de compra. Não inclui costura, estampa, frete ou outros custos de produção.</p></div>}
      <button className="an-primary" type="submit" disabled={!result || !color.trim() || !supplier.trim() || (!sameColor && !collarColor.trim())}><Plus size={16} />{material ? "Salvar material" : "Adicionar material"}</button>
    </form> : <div className="an-calc-body"><label>Conta<input aria-label="Conta rápida" value={expression} onChange={e => setExpression(e.target.value)} placeholder="Ex.: 43,90 × 10 + 26,50" onKeyDown={e => { if (e.key === "Enter") { try { setAnswer(evaluate(expression)); } catch { setAnswer("Confira a conta."); } } }} /></label><button className="an-primary" onClick={() => { try { setAnswer(evaluate(expression)); } catch { setAnswer("Confira a conta."); } }}>Calcular</button><output className="an-answer">{answer || "0"}</output><p className="an-help">Use +, −, × e ÷. Multiplicação e divisão são calculadas primeiro.</p></div>}
  </aside>;
}
function evaluate(raw: string): string {
  let text = raw.replace(/\s/g, "").replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (text.startsWith("-")) text = "0" + text;
  if (!/^\d+(?:\.\d+)?(?:[+*/-]\d+(?:\.\d+)?)*$/.test(text)) throw new Error();
  const tokens = text.match(/\d+(?:\.\d+)?|[+*/-]/g)!;
  const values = [Number(tokens[0])], signs: string[] = [];
  for (let i = 1; i < tokens.length; i += 2) { const v = Number(tokens[i + 1]); if (tokens[i] === "*") values.push(values.pop()! * v); else if (tokens[i] === "/") values.push(values.pop()! / v); else { signs.push(tokens[i]); values.push(v); } }
  const total = values.slice(1).reduce((sum, v, i) => signs[i] === "+" ? sum + v : sum - v, values[0]);
  if (!Number.isFinite(total)) throw new Error();
  return total.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}
