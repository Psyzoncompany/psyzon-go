"use client";

import { Keyboard, MousePointer2, Play, PanelsTopLeft, Volume2, VolumeX } from "lucide-react";
import type useInterfaceSounds from "./useInterfaceSounds";
import "./interface-sounds.css";

const actions = [
  { kind: "click", label: "Cliques e toques", detail: "Botões, menus e marcações.", icon: MousePointer2 },
  { kind: "navigate", label: "Mudanças de página", detail: "Uma transição leve entre as áreas.", icon: PanelsTopLeft },
  { kind: "type", label: "Digitação", detail: "Um toque discreto enquanto você escreve.", icon: Keyboard },
] as const;

export default function InterfaceSoundSettings({ preferences, changePreferences, preview, storageError }: ReturnType<typeof useInterfaceSounds>) {
  return <section className="panel interface-sounds" aria-labelledby="interface-sounds-title" data-ui-sound="off">
    <header><span className="sound-settings-icon">{preferences.enabled ? <Volume2 size={21} /> : <VolumeX size={21} />}</span><div><h2 id="interface-sounds-title">Sons da interface</h2><p>Toques suaves para acompanhar suas ações.</p></div></header>
    <div className="sound-master"><div><label htmlFor="interface-sounds-enabled">Ativar sons da interface</label><small id="interface-sounds-description">A preferência fica salva para sua conta neste navegador.</small></div><input id="interface-sounds-enabled" aria-describedby="interface-sounds-description" type="checkbox" checked={preferences.enabled} onChange={event => changePreferences({ enabled: event.target.checked })} /></div>
    <div className="sound-volume"><label htmlFor="interface-volume">Volume <output htmlFor="interface-volume">{preferences.volume}%</output></label><input id="interface-volume" type="range" min="0" max="100" step="1" value={preferences.volume} disabled={!preferences.enabled} onChange={event => changePreferences({ volume: Number(event.target.value) })} /></div>
    <div className="sound-action-list">{actions.map(({ kind, label, detail, icon: Icon }) => <div className="sound-action" key={kind}>
      <Icon size={18} aria-hidden="true" />
      <label htmlFor={`interface-sound-${kind}`}><b>{label}</b><small>{detail}</small></label>
      <button className="secondary" type="button" disabled={!preferences.enabled || !preferences.volume} aria-label={`Ouvir som de ${label.toLocaleLowerCase("pt-BR")}`} onClick={() => preview(kind)}><Play size={13} /> Ouvir</button>
      <input id={`interface-sound-${kind}`} type="checkbox" checked={preferences[kind]} disabled={!preferences.enabled} onChange={event => changePreferences({ [kind]: event.target.checked })} />
    </div>)}</div>
    {storageError && <p className="form-error" role="status">A opção foi aplicada. Este navegador está impedindo o salvamento da preferência.</p>}
  </section>;
}
