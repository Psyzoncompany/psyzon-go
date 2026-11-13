"use client";
import { useState } from "react";
import { WalletCards } from "lucide-react";
import { CountUp } from "./MotionValue";
import { companyBalance, type BalanceEntry } from "./company-balance";
import "./operational-controls.css";
export default function CompanyBalance({ entries, money, initialize }: { entries: BalanceEntry[]; money: (value: number) => string; initialize: (amount: number) => Promise<void> }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <section className="panel operations-panel"><header><h2><WalletCards size={19} aria-hidden="true" /> Saldo da empresa</h2><strong style={{fontSize:28}}><CountUp value={companyBalance(entries)} format={money} /></strong></header>
    {!entries.some(item=>item.id==="opening") && <button className="secondary" disabled={busy} onClick={async()=>{const input=window.prompt("Qual é o saldo inicial da empresa? (R$)","0");if(input===null)return;const amount=Number(input.replace(",","."));if(!Number.isFinite(amount)||amount<0||amount>100000000){setError("Informe um saldo inicial válido.");return;}setBusy(true);setError("");try{await initialize(amount);}catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível salvar.");}finally{setBusy(false);}}}>{busy?"Salvando…":"Registrar saldo inicial"}</button>}
    {error&&<p role="alert" className="form-error">{error}</p>}
    <details><summary>Histórico do saldo ({entries.length})</summary><ul className="operations-list">{entries.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).map(item=><li key={item.id}><span><b>{item.description}</b><small>{item.date.split("-").reverse().join("/")}</small></span><strong>{money(item.amount)}</strong></li>)}</ul></details>
  </section>;
}
