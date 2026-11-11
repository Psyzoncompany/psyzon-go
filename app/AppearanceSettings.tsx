"use client";

import { Aperture, Check, Layers, Palette, Sparkles, WalletCards } from "lucide-react";
import type { InterfaceAppearance } from "./interface-appearance";
import "./appearance-settings.css";

const palettes = [
  { value: "ocean", label: "Oceano", color: "#0667cf" },
  { value: "amethyst", label: "Ametista", color: "#7144c6" },
  { value: "graphite", label: "Grafite", color: "#435767" },
] as const;

const themes = [
  { theme: "original", name: "Original", detail: "Azul, superfícies sólidas e acabamento simples.", icon: Layers },
  { theme: "liquid-glass-card", name: "Liquid Glass Card", detail: "Transparência, luz e superfícies de vidro.", icon: Sparkles },
  { theme: "ios-premium", name: "iOS Premium", detail: "Roxo, superfícies claras e acabamento suave.", icon: WalletCards },
  { theme: "studio-glass", name: "Studio Glass", detail: "Vidro fumê e um cenário próprio em cada aba.", icon: Aperture },
] as const;

export default function AppearanceSettings({ appearance, changeAppearance, storageError }: {
  appearance: InterfaceAppearance;
  changeAppearance: (patch: Partial<InterfaceAppearance>) => void;
  storageError: boolean;
}) {
  const glass = appearance.theme === "liquid-glass-card";
  return <section className="appearance-settings panel" aria-labelledby="appearance-title">
    <header><span className="appearance-symbol"><Palette size={21} /></span><div><h2 id="appearance-title">Estilo da interface</h2></div></header>
    <fieldset className="appearance-options"><legend className="sr-only">Escolher interface</legend>
      {themes.map(({ theme, name, detail, icon: Icon }) => <label className="appearance-option" data-selected={appearance.theme === theme} key={theme}>
        <input type="radio" name="interface-theme" value={theme} checked={appearance.theme === theme} onChange={() => changeAppearance({ theme })} />
        <span className="appearance-preview" data-preview={theme} aria-hidden="true">
          <span className="preview-sidebar"><i /><i /><i /></span>
          <span className="preview-content"><i className="preview-heading" /><span className="preview-metrics"><i /><i /><i /></span><i className="preview-list" /><i className="preview-list" /></span>
          {theme === "liquid-glass-card" && <span className="preview-dock"><i /><i /><i /><i /></span>}
        </span>
        <span className="appearance-option-name"><Icon size={17} /><b>{name}</b><span className="appearance-selected" aria-hidden="true">{appearance.theme === theme && <Check size={14} />}</span></span>
        <small>{detail}</small>
      </label>)}
    </fieldset>
    <div className="appearance-customize">
      {glass && <fieldset className="appearance-palettes"><legend>Cor do ambiente</legend><div>{palettes.map(({ value, label, color }) => <label key={value} data-selected={appearance.palette === value}><input type="radio" name="glass-palette" checked={appearance.palette === value} onChange={() => changeAppearance({ palette: value })} /><span style={{ background: color }} aria-hidden="true" />{label}</label>)}</div></fieldset>}
      {appearance.theme !== "original" && <fieldset className="appearance-transparency"><legend>Transparência</legend><div>{[{ value: "balanced", label: "Vidro suave" }, { value: "reduced", label: "Mais contraste" }].map(({ value, label }) => <label key={value} data-selected={appearance.transparency === value}><input type="radio" name="glass-transparency" checked={appearance.transparency === value} onChange={() => changeAppearance({ transparency: value as InterfaceAppearance["transparency"] })} />{label}</label>)}</div></fieldset>}
      <div className="appearance-motion"><label htmlFor="glass-motion">Animações suaves</label><input id="glass-motion" type="checkbox" checked={appearance.motion === "full"} onChange={event => changeAppearance({ motion: event.target.checked ? "full" : "reduced" })} /></div>

    </div>
    {storageError && <p className="form-error" role="status">A escolha foi aplicada. Este navegador está impedindo o salvamento da preferência.</p>}
    <p className="appearance-status" role="status"><Check size={14} /> {themes.find(option => option.theme === appearance.theme)?.name} ativo</p>
  </section>;
}
