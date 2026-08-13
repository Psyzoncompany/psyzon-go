"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  FileText,
  History,
  Landmark,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  Mic,
  Paperclip,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { AIConversation, AIIntegrationStatus, AIMessage, AISettings } from "./ai/types";

type AIViewTarget = "inicio" | "producao" | "clientes" | "financeiro" | "pessoal" | "ai";

type Props = {
  getIdToken: () => Promise<string>;
  mode?: "page" | "panel";
  onClose?: () => void;
  onOpenFull?: () => void;
  onNavigate: (view: AIViewTarget) => void;
};

type SpeechRecognitionResultEvent = {
  results?: ArrayLike<{ [index: number]: { transcript?: string } }>;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const quickPrompts = [
  { icon: Landmark, label: "Como está meu financeiro?", prompt: "Como está meu financeiro neste mês? Compare entradas, saídas, resultado e valores a receber." },
  { icon: AlertTriangle, label: "Ver problemas", prompt: "Analise os dados reais e me mostre os problemas que preciso resolver primeiro." },
  { icon: RefreshCw, label: "Conferir movimentações", prompt: "Confira a conciliação com o Mercado Pago e audite também todas as saídas empresariais. Mostre os valores usando exatamente a formatação brasileira retornada pelo sistema, as divergências, possíveis duplicidades e o que precisa ser revisado." },
  { icon: Clock3, label: "Pedidos atrasados", prompt: "Quais pedidos estão atrasados e qual deve ser minha prioridade?" },
  { icon: TrendingUp, label: "Vendas deste mês", prompt: "Analise as vendas deste mês e compare com o mês passado." },
  { icon: FileText, label: "O que preciso fazer?", prompt: "O que preciso resolver hoje? Organize em urgente, importante e oportunidade." },
];

function apiErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir agora.";
}

function formatMoment(value: number | null) {
  if (!value) return "Ainda não sincronizado";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value * 1000));
}

function initialAssistantMessage(): AIMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: "Olá! Eu sou a PSYZON AI. Posso analisar seu financeiro, pedidos, clientes, produção e prioridades usando os dados reais do sistema. Por onde começamos?",
    payload: {
      summary: "Olá! Eu sou a PSYZON AI. Posso analisar seu financeiro, pedidos, clientes, produção e prioridades usando os dados reais do sistema. Por onde começamos?",
      severity: "info",
      metrics: [], alerts: [], recommendations: [], actions: [],
    },
    createdAt: Math.floor(Date.now() / 1000),
  };
}

function formatInlineMarkdown(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const content: ReactNode[] = [];
  let index = 0;
  const isTableDivider = (line: string) => /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const header = cells(line); index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) { rows.push(cells(lines[index])); index += 1; }
      content.push(<div className="ai-markdown-table-wrap" key={`table-${index}`}><table><thead><tr>{header.map((cell, cellIndex) => <th key={cellIndex}>{formatInlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{header.map((_, cellIndex) => <td key={cellIndex}>{formatInlineMarkdown(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { content.push(<h3 key={`heading-${index}`} className={`level-${heading[1].length}`}>{formatInlineMarkdown(heading[2])}</h3>); index += 1; continue; }
    if (line.startsWith(">")) { content.push(<blockquote key={`quote-${index}`}>{formatInlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>); index += 1; continue; }

    const unordered = /^[-*]\s+/.test(line); const ordered = /^\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      const matcher = ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/;
      while (index < lines.length && matcher.test(lines[index].trim())) { items.push(lines[index].trim().replace(matcher, "")); index += 1; }
      const listItems = items.map((item, itemIndex) => <li key={itemIndex}>{formatInlineMarkdown(item)}</li>);
      content.push(ordered ? <ol key={`list-${index}`}>{listItems}</ol> : <ul key={`list-${index}`}>{listItems}</ul>);
      continue;
    }

    const paragraph = [line]; index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^>\s?|^[-*]\s+|^\d+[.)]\s+/.test(lines[index].trim()) && !(lines[index].includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1]))) {
      paragraph.push(lines[index].trim()); index += 1;
    }
    content.push(<p key={`paragraph-${index}`}>{paragraph.map((part, partIndex) => <span key={partIndex}>{formatInlineMarkdown(part)}{partIndex < paragraph.length - 1 && <br />}</span>)}</p>);
  }
  return <div className="ai-markdown-content">{content}</div>;
}

export default function PSYZONAIWorkspace({ getIdToken, mode = "page", onClose, onOpenFull, onNavigate }: Props) {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string>("");
  const [messages, setMessages] = useState<AIMessage[]>([initialAssistantMessage()]);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [integrations, setIntegrations] = useState<AIIntegrationStatus | null>(null);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState("");
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const storedConversation = sessionStorage.getItem("psyzon-ai-active-conversation");
    if (storedConversation) setActiveConversation(storedConversation);
  }, []);
  useEffect(() => {
    if (activeConversation) sessionStorage.setItem("psyzon-ai-active-conversation", activeConversation);
    else sessionStorage.removeItem("psyzon-ai-active-conversation");
  }, [activeConversation]);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getIdToken();
    const response = await fetch(path, { ...init, headers: { ...init?.headers, authorization: `Bearer ${token}`, "content-type": "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir agora.");
    return data;
  }, [getIdToken]);

  const loadInitial = useCallback(async () => {
    try {
      const data = await api("/api/ai");
      setConversations(data.conversations ?? []);
      setSettings(data.settings);
      setIntegrations(data.integrations);
    } catch (nextError) { setError(apiErrorMessage(nextError)); }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    void api("/api/ai").then((data) => {
      if (cancelled) return;
      setConversations(data.conversations ?? []);
      setSettings(data.settings);
      setIntegrations(data.integrations);
    }).catch((nextError) => {
      if (!cancelled) setError(apiErrorMessage(nextError));
    });
    return () => { cancelled = true; };
  }, [api]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    if (!activeConversation) return;
    api(`/api/ai?conversationId=${encodeURIComponent(activeConversation)}`).then((data) => setMessages(data.messages?.length ? data.messages : [initialAssistantMessage()])).catch((nextError) => setError(apiErrorMessage(nextError))).finally(() => setLoadingState(""));
  }, [activeConversation, api]);

  const newConversation = () => {
    sessionStorage.removeItem("psyzon-ai-active-conversation");
    setActiveConversation(""); setMessages([initialAssistantMessage()]); setInput(""); setAttachment(null); setError("");
    if (mode === "panel") setSidebarOpen(false);
  };

  const deleteConversationById = async (id: string) => {
    try {
      await api(`/api/ai?conversationId=${encodeURIComponent(id)}`, { method: "DELETE" });
      setConversations((current) => current.filter((item) => item.id !== id));
      if (activeConversation === id) newConversation();
    } catch (nextError) { setError(apiErrorMessage(nextError)); }
  };

  const sendMessage = async (question?: string) => {
    const clean = (question ?? input).trim();
    if (!clean || loading) return;
    const composed = attachment ? `${clean}\n\nARQUIVO ANEXADO PELO USUÁRIO (${attachment.name}):\n${attachment.content.slice(0, 12000)}` : clean;
    const optimistic: AIMessage = { id: "local-pending", role: "user", content: clean, createdAt: 0 };
    setMessages((current) => [...current, optimistic]); setInput(""); setAttachment(null); setError(""); setLoading(true); setLoadingState("Entendendo sua solicitação...");
    const states = ["Consultando seus dados...", "Cruzando informações...", "Preparando uma resposta objetiva..."];
    let stateIndex = 0; const timer = window.setInterval(() => { setLoadingState(states[Math.min(stateIndex, states.length - 1)]); stateIndex += 1; }, 1700);
    try {
      const data = await api("/api/ai", { method: "POST", body: JSON.stringify({ action: "message", message: composed, conversationId: activeConversation || undefined }) });
      setMessages((current) => [...current.filter((item) => item.id !== optimistic.id), data.userMessage ?? optimistic, data.message]);
      setActiveConversation(data.conversation.id);
      setConversations((current) => {
        const without = current.filter((item) => item.id !== data.conversation.id);
        return [data.conversation, ...without];
      });
    } catch (nextError) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setInput(clean); setError(apiErrorMessage(nextError));
    } finally { window.clearInterval(timer); setLoading(false); setLoadingState(""); }
  };

  const onSubmit = (event: FormEvent) => { event.preventDefault(); void sendMessage(); };
  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const allowed = ["text/plain", "text/csv", "application/json", "text/markdown"];
    if (!allowed.includes(file.type) && !/\.(txt|csv|json|md)$/i.test(file.name)) return setError("Envie arquivos TXT, CSV, JSON ou Markdown de até 1 MB.");
    if (file.size > 1_000_000) return setError("O arquivo precisa ter no máximo 1 MB.");
    setAttachment({ name: file.name, content: await file.text() }); setError("");
  };

  const startVoice = () => {
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return setError("Ditado por voz não está disponível neste navegador.");
    const recognition = new Recognition(); recognition.lang = "pt-BR"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true); recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setError("Não consegui ouvir. Verifique a permissão do microfone."); };
    recognition.onresult = (event) => { const transcript = event.results?.[0]?.[0]?.transcript ?? ""; setInput((current) => `${current}${current ? " " : ""}${transcript}`); textareaRef.current?.focus(); };
    recognition.start();
  };

  const copyMessage = async (message: AIMessage) => {
    await navigator.clipboard.writeText(message.content); setCopiedId(message.id); window.setTimeout(() => setCopiedId(""), 1500);
  };

  const exportConversation = () => {
    const content = messages.map((message) => `${message.role === "user" ? "VOCÊ" : "PSYZON AI"}\n${message.content}`).join("\n\n---\n\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `psyzon-ai-${new Date().toISOString().slice(0, 10)}.txt`; anchor.click(); URL.revokeObjectURL(url);
  };

  const updateSettings = async (changes: Partial<AISettings>) => {
    if (!settings) return;
    const previous = settings; const next = { ...settings, ...changes }; setSettings(next);
    try { const data = await api("/api/ai", { method: "PATCH", body: JSON.stringify(changes) }); setSettings(data.settings); }
    catch (nextError) { setSettings(previous); setError(apiErrorMessage(nextError)); }
  };

  const syncMercadoPago = async () => {
    setSyncing(true); setError("");
    try { await api("/api/integrations/mercadopago", { method: "POST", body: "{}" }); await loadInitial(); void sendMessage("Mostre o resultado completo da conciliação do Mercado Pago e da auditoria das saídas empresariais. Use somente os campos de valor já formatados em BRL, sem alterar pontos ou vírgulas. Para cada divergência, liste os dados externos e internos disponíveis. Quando não houver pagamento externo, explique a causa provável e mostre valor, descrição, data, categoria, pedido e ID interno; não peça um ID externo que não existe. Nas saídas, mostre total conferido, itens que precisam de revisão e possíveis duplicidades com valor, descrição, categoria, data e ID."); }
    catch (nextError) { setError(apiErrorMessage(nextError)); }
    finally { setSyncing(false); }
  };

  const confirmAction = async (confirmationId: string) => {
    setLoading(true); setLoadingState("Executando ação autorizada..."); setError("");
    try { const data = await api("/api/ai", { method: "POST", body: JSON.stringify({ action: "confirm", confirmationId }) }); setMessages((current) => [...current, data.message]); }
    catch (nextError) { setError(apiErrorMessage(nextError)); }
    finally { setLoading(false); setLoadingState(""); }
  };

  const cancelConfirmation = async (confirmationId: string) => {
    try { await api("/api/ai", { method: "POST", body: JSON.stringify({ action: "cancel_confirmation", confirmationId }) }); setMessages((current) => current.map((message) => message.payload?.confirmation?.id === confirmationId ? { ...message, payload: { ...message.payload!, summary: "Alteração cancelada.", confirmation: undefined }, content: "Alteração cancelada." } : message)); }
    catch (nextError) { setError(apiErrorMessage(nextError)); }
  };

  const currentTitle = conversations.find((item) => item.id === activeConversation)?.title ?? "Nova conversa";
  const showWelcome = messages.length === 1 && messages[0].id === "welcome";

  return <section className={`psyzon-ai-shell ${mode}`}>
    <aside className={`ai-conversation-sidebar ${sidebarOpen ? "open" : ""}`}>
      <header><div className="ai-brand"><span><Sparkles size={17} /></span><div><b>PSYZON AI</b><small>Copiloto administrativo</small></div></div>{mode === "panel" && <button onClick={() => setSidebarOpen(false)} aria-label="Fechar histórico"><X size={17} /></button>}</header>
      <button className="ai-new-chat" onClick={newConversation}><MessageSquarePlus size={16} /> Nova conversa</button>
      <div className="ai-history-label"><History size={13} /> Histórico</div>
      <div className="ai-conversation-list">{conversations.length ? conversations.map((conversation) => <div key={conversation.id} className={activeConversation === conversation.id ? "active" : ""}><button onClick={() => { setActiveConversation(conversation.id); setSidebarOpen(false); }}><span>{conversation.title}</span><small>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(conversation.updatedAt * 1000))}</small></button><button onClick={() => void deleteConversationById(conversation.id)} aria-label={`Excluir ${conversation.title}`}><Trash2 size={13} /></button></div>) : <p>Suas análises salvas aparecerão aqui.</p>}</div>
      <footer><button onClick={() => setSettingsOpen(true)}><Settings2 size={15} /><span><b>Configurações</b><small>Permissões e integrações</small></span></button><div className="ai-security"><ShieldCheck size={13} /><span>Chaves protegidas no servidor</span></div></footer>
    </aside>
    {sidebarOpen && <button className={`ai-sidebar-scrim ${mode}`} onClick={() => setSidebarOpen(false)} aria-label="Fechar histórico" />}

    <div className="ai-main">
      <header className="ai-topbar"><div>{mode === "page" && <button className="ai-mobile-back" onClick={() => onNavigate("inicio")} aria-label="Voltar ao início"><ChevronLeft size={20} /></button>}<button onClick={() => setSidebarOpen((current) => !current)} aria-label="Abrir histórico"><Menu size={19} /></button><span className="ai-avatar"><Sparkles size={18} /></span><span><b>{currentTitle}</b><small><i /> PSYZON AI · dados em tempo real</small></span></div><div><button className="ai-export-action" onClick={exportConversation} aria-label="Exportar conversa"><ArrowDownToLine size={17} /></button><button onClick={() => setSettingsOpen(true)} aria-label="Configurações da IA"><Settings2 size={17} /></button>{mode === "panel" && onOpenFull && <button className="ai-open-full" onClick={onOpenFull}><ArrowRight size={16} /><span>Abrir página</span></button>}{mode === "panel" && onClose && <button onClick={onClose} aria-label="Fechar PSYZON AI"><X size={18} /></button>}</div></header>

      <div className="ai-chat-scroll">
        {showWelcome && <div className="ai-welcome"><div className="ai-welcome-orb"><BrainCircuit size={31} /></div><span className="eyebrow">INTELIGÊNCIA PARA SUA OPERAÇÃO</span><h1>O que vamos analisar hoje?</h1><p>Pergunte sobre financeiro, pedidos, clientes, produção ou o que precisa da sua atenção. Eu consulto os dados reais antes de responder.</p><div className="ai-quick-grid">{quickPrompts.map(({ icon: Icon, label, prompt }) => <button key={label} onClick={() => void sendMessage(prompt)}><span><Icon size={18} /></span><b>{label}</b><ArrowRight size={15} /></button>)}</div></div>}
        <div className="ai-messages">{messages.map((message) => message.role === "user" ? <article className="ai-message user" key={message.id}><div className="ai-message-avatar"><UserRound size={15} /></div><div><p>{message.content}</p></div></article> : <AIAnswer key={message.id} message={message} copied={copiedId === message.id} onCopy={() => void copyMessage(message)} onNavigate={onNavigate} onPrompt={(prompt) => void sendMessage(prompt)} onConfirm={(id) => void confirmAction(id)} onCancel={(id) => void cancelConfirmation(id)} />)}{loading && <article className="ai-message assistant loading"><div className="ai-message-avatar"><Sparkles size={16} /></div><div><span className="ai-thinking"><LoaderCircle size={15} />{loadingState}</span><div className="ai-typing"><i /><i /><i /></div></div></article>}<div ref={endRef} /></div>
      </div>

      <div className="ai-composer-zone">{error && <div className="ai-error"><AlertTriangle size={15} /><span>{error}</span><button onClick={() => setError("")}><X size={14} /></button></div>}{attachment && <div className="ai-attachment"><FileText size={15} /><span><b>{attachment.name}</b><small>{attachment.content.length.toLocaleString("pt-BR")} caracteres</small></span><button onClick={() => setAttachment(null)}><X size={14} /></button></div>}<form className="ai-composer" onSubmit={onSubmit}><textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKey} rows={1} placeholder="Pergunte algo sobre sua empresa..." aria-label="Mensagem para PSYZON AI" disabled={loading} /><div><span><button type="button" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo" title="Anexar TXT, CSV, JSON ou Markdown"><Paperclip size={18} /></button><input ref={fileRef} type="file" accept=".txt,.csv,.json,.md,text/plain,text/csv,application/json,text/markdown" onChange={handleFile} hidden /><button type="button" className={listening ? "listening" : ""} onClick={startVoice} aria-label="Ditado por voz"><Mic size={18} /></button></span><small>Enter para enviar · Shift + Enter para quebrar linha</small><button type="submit" disabled={!input.trim() || loading} aria-label="Enviar mensagem"><Send size={18} /></button></div></form><p>A PSYZON AI pode cometer erros. Alterações financeiras sempre exigem confirmação.</p></div>
    </div>

    {settingsOpen && settings && <div className="ai-settings-backdrop"><button className="ai-settings-scrim" onClick={() => setSettingsOpen(false)} aria-label="Fechar configurações" /><aside className="ai-settings-panel"><header><div><span><Settings2 size={18} /></span><div><b>Configurações da PSYZON AI</b><small>Controle de acesso, memória e integrações</small></div></div><button onClick={() => setSettingsOpen(false)} aria-label="Fechar configurações"><X size={18} /></button></header><div className="ai-settings-content"><section><h3>Inteligência Artificial</h3><label htmlFor="ai-enabled"><span><b>Ativar PSYZON AI</b><small>Disponibiliza chat e análises administrativas.</small></span><input id="ai-enabled" aria-label="Ativar PSYZON AI" type="checkbox" checked={settings.enabled} onChange={(event) => void updateSettings({ enabled: event.target.checked })} /></label><label htmlFor="ai-save-history"><span><b>Salvar histórico</b><small>Conserva conversas por usuário.</small></span><input id="ai-save-history" aria-label="Salvar histórico" type="checkbox" checked={settings.saveHistory} onChange={(event) => void updateSettings({ saveHistory: event.target.checked })} /></label><label htmlFor="ai-financial-analysis"><span><b>Análise financeira</b><small>Permite cruzar receitas, despesas e pedidos.</small></span><input id="ai-financial-analysis" aria-label="Permitir análise financeira" type="checkbox" checked={settings.financialAnalysis} onChange={(event) => void updateSettings({ financialAnalysis: event.target.checked })} /></label></section><section><h3>Permissão da IA</h3><div className="ai-permission-options">{[
        ["read_only", "Somente leitura", "Consulta e analisa sem modificar dados."],
        ["administrative", "Alterações administrativas", "Permite categoria e status com auditoria."],
        ["financial_confirm", "Financeiro com confirmação", "Ações financeiras exigem aprovação explícita."],
      ].map(([value, label, hint]) => <button key={value} className={settings.permissionMode === value ? "active" : ""} onClick={() => void updateSettings({ permissionMode: value as AISettings["permissionMode"] })}><span>{settings.permissionMode === value ? <Check size={14} /> : null}</span><span><b>{label}</b><small>{hint}</small></span></button>)}</div></section><section><h3>Integrações</h3><IntegrationCard icon={Sparkles} name={integrations?.ai.provider ?? "Groq"} configured={integrations?.ai.configured ?? false} detail={integrations?.ai.configured ? `Modelo ${integrations?.ai.model}` : "Aguardando GROQ_API_KEY"} /><IntegrationCard icon={RefreshCw} name="Mercado Pago" configured={integrations?.mercadoPago.configured ?? false} detail={integrations?.mercadoPago.configured ? `Última sincronização: ${formatMoment(integrations?.mercadoPago.lastSyncedAt ?? null)}` : "Aguardando credenciais do Mercado Pago"} action={integrations?.mercadoPago.configured ? <button onClick={() => void syncMercadoPago()} disabled={syncing || !settings.mercadoPagoEnabled}>{syncing ? <LoaderCircle size={13} /> : <RefreshCw size={13} />} Sincronizar agora</button> : null} /><label htmlFor="ai-mercado-pago"><span><b>Conciliação Mercado Pago</b><small>Consulta e compara; nunca movimenta dinheiro.</small></span><input id="ai-mercado-pago" aria-label="Ativar conciliação Mercado Pago" type="checkbox" checked={settings.mercadoPagoEnabled} disabled={!integrations?.mercadoPago.configured} onChange={(event) => void updateSettings({ mercadoPagoEnabled: event.target.checked })} /></label></section></div><footer><ShieldCheck size={15} /><span>Credenciais são configuradas no servidor e nunca aparecem no navegador.</span></footer></aside></div>}
  </section>;
}

function IntegrationCard({ icon: Icon, name, configured, detail, action }: { icon: typeof Sparkles; name: string; configured: boolean; detail: string; action?: React.ReactNode }) {
  return <div className="ai-integration-card"><span><Icon size={17} /></span><span><b>{name}</b><small>{detail}</small></span><i className={configured ? "connected" : "pending"} />{action}</div>;
}

function AIAnswer({ message, copied, onCopy, onNavigate, onPrompt, onConfirm, onCancel }: { message: AIMessage; copied: boolean; onCopy: () => void; onNavigate: (target: AIViewTarget) => void; onPrompt: (prompt: string) => void; onConfirm: (id: string) => void; onCancel: (id: string) => void }) {
  const payload = message.payload;
  return <article className="ai-message assistant"><div className="ai-message-avatar"><Sparkles size={16} /></div><div className="ai-answer"><div className="ai-answer-summary"><MarkdownText text={payload?.summary ?? message.content} /></div>{payload?.metrics?.length ? <div className="ai-response-metrics">{payload.metrics.map((metric) => <div key={metric.label}><small>{metric.label}</small><b className={metric.tone ?? "neutral"}>{metric.value}</b>{metric.trend && <span>{metric.trend}</span>}</div>)}</div> : null}{payload?.alerts?.length ? <div className="ai-response-alerts">{payload.alerts.map((alert, index) => <button key={`${alert.title}-${index}`} className={alert.severity} onClick={() => alert.entityType && onNavigate(alert.entityType === "order" ? "producao" : alert.entityType === "client" ? "clientes" : "financeiro")}><span>{alert.severity === "critical" || alert.severity === "warning" ? <AlertTriangle size={15} /> : <BarChart3 size={15} />}</span><span><b>{alert.title}</b><small>{alert.detail}</small></span>{alert.entityType && <ArrowRight size={14} />}</button>)}</div> : null}{payload?.recommendations?.length ? <div className="ai-recommendations"><header><BrainCircuit size={15} /><b>Recomendações</b></header>{payload.recommendations.map((item, index) => <div key={item}><span>{index + 1}</span><p>{item}</p></div>)}</div> : null}{payload?.confirmation && <div className="ai-confirmation"><header><ShieldCheck size={17} /><div><b>Confirmação necessária</b><small>Alteração financeira importante</small></div></header><dl><div><dt>Ação</dt><dd>{payload.confirmation.action}</dd></div>{payload.confirmation.currentValue && <div><dt>Valor atual</dt><dd>{payload.confirmation.currentValue}</dd></div>}{payload.confirmation.newValue && <div><dt>Novo valor</dt><dd>{payload.confirmation.newValue}</dd></div>}<div><dt>Motivo</dt><dd>{payload.confirmation.reason}</dd></div><div><dt>Impacto</dt><dd>{payload.confirmation.impact}</dd></div></dl><footer><button onClick={() => onCancel(payload.confirmation!.id)}>Cancelar</button><button onClick={() => onConfirm(payload.confirmation!.id)}><Check size={15} /> Confirmar alteração</button></footer></div>}{payload?.actions?.length ? <div className="ai-response-actions">{payload.actions.map((action) => <button key={`${action.label}-${action.target ?? action.prompt}`} onClick={() => action.type === "prompt" && action.prompt ? onPrompt(action.prompt) : action.target && onNavigate(action.target)}>{action.label}<ArrowRight size={14} /></button>)}</div> : null}<footer className="ai-answer-footer">{message.toolNames?.length ? <span><ShieldCheck size={12} /> {message.toolNames.length} fonte(s) consultada(s)</span> : <span>PSYZON AI</span>}{payload?.confidence && <span>Confiança {payload.confidence}</span>}<button onClick={onCopy}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copiado" : "Copiar"}</button></footer></div></article>;
}
