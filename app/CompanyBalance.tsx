"use client";
import { useState } from "react";
import { WalletCards, ArrowUpRight, Plus } from "lucide-react";
import { CountUp } from "./MotionValue";
import { companyBalance, type BalanceEntry } from "./company-balance";
import "./operational-controls.css";
import NoteDialog from "./notes/NoteDialog";
import "./company-balance.css";
export default function CompanyBalance({ entries, money, initialize }: { entries: BalanceEntry[]; money: (value: number) => string; initialize: (amount: number) => Promise<void> }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [historyOpen,setHistoryOpen]=useState(false);
  return <section className="metric-card company-balance-card" aria-label="Saldo da empresa"><div className="metric-top"><span><WalletCards size={19} aria-hidden="true" /></span><h2>Saldo da empresa</h2></div><strong><CountUp value={companyBalance(entries)} format={money} /></strong>
    <div className="company-balance-actions"><button className="company-balance-history" onClick={()=>setHistoryOpen(true)}>Ver histórico <ArrowUpRight size={14} aria-hidden="true" /></button>
    {!entries.some(item=>item.id==="opening") && <button className="company-balance-initialize" disabled={busy} onClick={async()=>{const input=window.prompt("Qual é o saldo inicial da empresa? (R$)","0");if(input===null)return;const amount=Number(input.replace(",","."));if(!Number.isFinite(amount)||amount<0||amount>100000000){setError("Informe um saldo inicial válido.");return;}setBusy(true);setError("");try{await initialize(amount);}catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível salvar.");}finally{setBusy(false);}}} aria-label="Registrar saldo inicial"><Plus size={14} aria-hidden="true" />{busy?"Salvando…":"Saldo inicial"}</button>}</div>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {historyOpen && <NoteDialog title="Histórico do saldo" close={()=>setHistoryOpen(false)}><div className="company-balance-history-content"><ul className="operations-list">{entries.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).map(item=><li key={item.id}><span><b>{item.description}</b><small>{item.date.split("-").reverse().join("/")}</small></span><strong>{money(item.amount)}</strong></li>)}</ul>{!entries.length && <p className="operations-muted">Nenhuma movimentação registrada.</p>}</div></NoteDialog>}
  </section>;
}
