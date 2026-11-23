import { interfaceSoundFiles, type InterfaceSound, type SoundPreferences } from "./interface-sound-model";

/** One decoded MP3 per action, shared across interactions in the current account. */
export class InterfaceAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private buffers = new Map<InterfaceSound, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private fallback = new Map<InterfaceSound, HTMLAudioElement>();
  private loading?: Promise<void>;
  private controller = new AbortController();
  private closed = false;
  private played: Record<InterfaceSound, number> = { click: -Infinity, navigate: -Infinity, type: -Infinity };

  constructor(private preferences: SoundPreferences) {
    this.warm();
  }

  configure(preferences: SoundPreferences) {
    this.preferences = preferences;
    if (this.output && this.context) this.output.gain.setTargetAtTime(preferences.volume / 100, this.context.currentTime, .015);
    this.fallback.forEach((audio, kind) => { audio.volume = preferences.volume / 100 * this.level(kind); });
    if (!preferences.enabled || preferences.volume === 0) this.stop();
    else this.warm();
  }

  private warm() {
    if (this.closed || !this.preferences.enabled || this.loading) return;
    try {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) {
        for (const [kind, path] of Object.entries(interfaceSoundFiles)) {
          if (this.fallback.has(kind as InterfaceSound)) continue;
          const audio = new window.Audio(path);
          audio.preload = "auto";
          audio.volume = this.preferences.volume / 100 * this.level(kind as InterfaceSound);
          this.fallback.set(kind as InterfaceSound, audio);
          audio.load();
        }
        this.loading = Promise.resolve();
        return;
      }
      this.context ??= new Audio();
      this.output ??= this.context.createGain();
      this.output.gain.value = this.preferences.volume / 100;
      this.output.connect(this.context.destination);
      const context = this.context;
      this.loading = Promise.allSettled(Object.entries(interfaceSoundFiles).map(async ([kind, path]) => {
        const response = await fetch(path, { signal: this.controller.signal, credentials: "omit", cache: "force-cache" });
        if (!response.ok) return;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!this.closed) this.buffers.set(kind as InterfaceSound, buffer);
      })).then(() => {});
    } catch { /* Sound support is optional. */ }
  }

  unlock() {
    if (this.closed || !this.preferences.enabled || document.hidden) return;
    this.warm();
    if (this.context?.state === "suspended") return this.context.resume().catch(() => {});
  }

  play(kind: InterfaceSound, preview = false) {
    const context = this.context;
    const buffer = this.buffers.get(kind);
    const now = performance.now();
    if (this.closed || !this.preferences.enabled || this.preferences.volume === 0 || (!preview && !this.preferences[kind]) || document.hidden) return;
    const fallback = this.fallback.get(kind);
    if (fallback ? !preview && fallback.readyState < 2 : !context || context.state !== "running" || !buffer || !this.output) return;
    if (!preview && now - this.played[kind] < (kind === "type" ? 65 : 100)) return;
    // A navigation replaces the click that initiated it.
    if (kind === "click" && now - this.played.navigate < 110) return;
    this.played[kind] = now;
    try {
      if (kind === "navigate") this.stop();
      if (fallback) {
        fallback.currentTime = 0;
        void fallback.play().catch(() => {});
        return;
      }
      if (!context || !buffer || !this.output) return;
      if (this.sources.size >= 4) this.sources.values().next().value?.stop();
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = this.level(kind);
      source.connect(gain);
      gain.connect(this.output);
      this.sources.add(source);
      source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); };
      source.start();
    } catch { /* Feedback must never interrupt an action or a save. */ }
  }

  async preview(kind: InterfaceSound) {
    await Promise.all([this.unlock(), this.loading]);
    this.play(kind, true);
  }

  private level(kind: InterfaceSound) {
    return kind === "type" ? .4 : kind === "click" ? .7 : .85;
  }

  stop() {
    this.sources.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } });
    this.sources.clear();
    this.fallback.forEach(audio => { audio.pause(); });
  }

  suspend() {
    this.stop();
    if (this.context?.state === "running") void this.context.suspend().catch(() => {});
  }

  dispose() {
    this.closed = true;
    this.stop();
    this.controller.abort();
    this.fallback.forEach(audio => { audio.removeAttribute("src"); audio.load(); });
    this.fallback.clear();
    void this.context?.close().catch(() => {});
  }
}
