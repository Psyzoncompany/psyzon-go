import { interfaceSoundFiles, type InterfaceSound, type SoundPreferences } from "./interface-sound-model";

/** One decoded MP3 per action, shared across interactions in the current account. */
export class InterfaceAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private buffers = new Map<InterfaceSound, AudioBuffer>();
  private encoded = new Map<InterfaceSound, ArrayBuffer>();
  private decoding = new Map<InterfaceSound, Promise<void>>();
  private sources = new Set<AudioBufferSourceNode>();
  private fallback = new Map<InterfaceSound, HTMLAudioElement>();
  private loading?: Promise<void>;
  private controller = new AbortController();
  private closed = false;
  private resetOnUnlock = false;
  private generation = 0;
  private session?: { value: { type: string }; previousType: string };
  private played: Record<InterfaceSound, number> = { click: -Infinity, type: -Infinity, notification: -Infinity, success: -Infinity };

  constructor(private preferences: SoundPreferences) {
    this.warm();
  }

  configure(preferences: SoundPreferences) {
    this.preferences = preferences;
    if (this.output && this.context) this.output.gain.setTargetAtTime(preferences.volume / 100, this.context.currentTime, .015);
    this.fallback.forEach((audio, kind) => { audio.volume = preferences.volume / 100 * this.level(kind); });
    if (!preferences.enabled || preferences.volume === 0) { this.stop(); this.releaseSession(); }
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
      this.loading = Promise.allSettled(Object.entries(interfaceSoundFiles).map(async ([kind, path]) => {
        const response = await fetch(path, { signal: this.controller.signal, credentials: "omit", cache: "force-cache" });
        if (!response.ok) return;
        const data = await response.arrayBuffer();
        if (this.closed) return;
        this.encoded.set(kind as InterfaceSound, data);
        await this.decode(kind as InterfaceSound);
      })).then(() => {});
    } catch { /* Sound support is optional. */ }
  }

  private decode(kind: InterfaceSound): Promise<void> | undefined {
    const data = this.encoded.get(kind);
    if (!this.context || !data || this.buffers.has(kind)) return;
    const pending = this.decoding.get(kind);
    if (pending) return pending;
    const task = this.context.decodeAudioData(data.slice(0)).then(buffer => {
      if (!this.closed) this.buffers.set(kind, buffer);
    }).catch(() => {}).finally(() => { this.decoding.delete(kind); });
    this.decoding.set(kind, task);
    return task;
  }

  private activateSession() {
    try {
      const value = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      // Route enabled effects through media volume on iPhone, including when
      // the ringer is silent. Leave recording/other explicit sessions alone.
      if (!this.session && value && ["auto", "ambient"].includes(value.type)) {
        const previousType = value.type;
        value.type = "playback";
        this.session = { value, previousType };
      }
    } catch { /* Older Safari versions may expose a read-only session. */ }
  }

  private releaseSession() {
    try {
      if (this.session?.value.type === "playback") this.session.value.type = this.session.previousType;
    } catch { /* Session support is optional. */ }
    this.session = undefined;
  }

  unlock(gesture = true) {
    if (this.closed || !this.preferences.enabled || this.preferences.volume === 0 || document.hidden) return;
    this.warm();
    try {
      const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      if (!gesture && (!this.context || this.resetOnUnlock)) return;
      if (gesture) this.activateSession();
      // iOS can report a running context whose output died while backgrounded.
      // Recreate its connection on the next gesture, retaining decoded MP3s.
      if (this.resetOnUnlock || this.context?.state === "closed") {
        void this.context?.close().catch(() => {});
        this.output?.disconnect();
        this.context = undefined;
        this.output = undefined;
        this.resetOnUnlock = false;
      }
      if (!this.context) {
        // Create and resume synchronously inside the tap, never after fetching.
        this.context = new Audio();
        this.output = this.context.createGain();
        this.output.gain.value = this.preferences.volume / 100;
        this.output.connect(this.context.destination);
        for (const kind of this.encoded.keys()) void this.decode(kind);
      }
      const context = this.context;
      if (context.state !== "running") {
        const resumed = context.resume().catch(() => {});
        // Safari needs an actual source started in the same user gesture.
        const prime = context.createBufferSource();
        prime.buffer = context.createBuffer(1, 1, context.sampleRate);
        prime.connect(context.destination);
        prime.onended = () => prime.disconnect();
        prime.start(0);
        return resumed;
      }
    } catch { /* A later trusted gesture can retry without blocking the UI. */ }
  }

  play(kind: InterfaceSound, preview = false) {
    const context = this.context;
    const buffer = this.buffers.get(kind);
    const now = performance.now();
    if (this.closed || !this.preferences.enabled || this.preferences.volume === 0 || (!preview && !this.preferences[kind]) || document.hidden) return;
    const fallback = this.fallback.get(kind);
    if (fallback ? !preview && fallback.readyState < 2 : !context || context.state !== "running" || !buffer || !this.output) return;
    const interval = kind === "type" ? 65 : kind === "notification" || kind === "success" ? 1200 : 100;
    if (!preview && now - this.played[kind] < interval) return;
    this.played[kind] = now;
    try {
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
    await this.playWhenReady(kind, true);
  }

  async playWhenReady(kind: InterfaceSound, preview = false) {
    const requestedAt = performance.now();
    const generation = this.generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Some iOS versions leave resume() pending indefinitely. Do not retain a
      // stale startup/confirmation that could play after the next interaction.
      await Promise.race([
        Promise.all([this.unlock(), this.loading]).then(() => this.decode(kind)),
        new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); }),
      ]);
      if (generation === this.generation && performance.now() - requestedAt < 1500) this.play(kind, preview);
    } finally { clearTimeout(timer); }
  }

  private level(kind: InterfaceSound) {
    return kind === "type" ? .4 : kind === "click" ? .7 : .85;
  }

  stop() {
    this.generation++;
    this.sources.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } });
    this.sources.clear();
    this.fallback.forEach(audio => { audio.pause(); });
  }

  suspend() {
    this.stop();
    this.releaseSession();
    // Safari/iPadOS may keep a stale output even when state says "running".
    this.resetOnUnlock = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (this.context?.state === "running") void this.context.suspend().catch(() => {});
  }

  dispose() {
    this.closed = true;
    this.stop();
    this.releaseSession();
    this.controller.abort();
    this.fallback.forEach(audio => { audio.removeAttribute("src"); audio.load(); });
    this.fallback.clear();
    void this.context?.close().catch(() => {});
  }
}
