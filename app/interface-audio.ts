import { interfaceSoundFiles, type InterfaceSound, type SoundPreferences } from "./interface-sound-model";

const isInteraction = (kind: InterfaceSound) => kind === "click" || kind === "navigate" || kind === "close";

/** One decoded clip per action, shared across interactions in the current account. */
export class InterfaceAudio {
  private context?: AudioContext;
  private output?: GainNode;
  private buffers = new Map<InterfaceSound, AudioBuffer>();
  private encoded = new Map<InterfaceSound, ArrayBuffer>();
  private decoding = new Map<InterfaceSound, Promise<void>>();
  private sources = new Map<AudioBufferSourceNode, { gain: GainNode; kind: InterfaceSound; startedAt: number; duration: number }>();
  private fallback = new Map<InterfaceSound, HTMLAudioElement>();
  private fallbackPool = new Map<InterfaceSound, HTMLAudioElement[]>();
  private fallbackUnlocked = new WeakSet<HTMLAudioElement>();
  private fallbackUnlocking = new WeakSet<HTMLAudioElement>();
  private fallbackVoices = new Map<HTMLAudioElement, InterfaceSound>();
  private fallbackFades = new Map<HTMLAudioElement, number>();
  private loading?: Promise<void>;
  private controller = new AbortController();
  private closed = false;
  private resetOnUnlock = false;
  private generation = 0;
  private interactionRevision = 0;
  private session?: { value: { type: string }; previousType: string };
  private played: Record<InterfaceSound, number> = { click: -Infinity, navigate: -Infinity, close: -Infinity, type: -Infinity, notification: -Infinity, success: -Infinity };

  constructor(private preferences: SoundPreferences) {
    this.warm();
  }

  configure(preferences: SoundPreferences) {
    this.preferences = preferences;
    if (this.output && this.context) this.output.gain.setTargetAtTime(preferences.volume / 100, this.context.currentTime, .015);
    this.fallbackPool.forEach((pool, kind) => pool.forEach(audio => {
      if (!this.fallbackUnlocking.has(audio)) audio.volume = preferences.volume / 100 * this.level(kind);
    }));
    this.fallbackVoices.forEach((kind, audio) => { if (!this.fallbackFades.has(audio)) audio.volume = preferences.volume / 100 * this.level(kind); });
    if (!preferences.enabled || preferences.volume === 0) { this.stop(true); this.releaseSession(); }
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
          const second = audio.cloneNode(true) as HTMLAudioElement;
          second.preload = "auto";
          second.load();
          this.fallbackPool.set(kind as InterfaceSound, [audio, second]);
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
      if (!Audio) {
        if (gesture) this.fallbackPool.forEach(pool => pool.forEach(audio => {
          if (this.fallbackUnlocked.has(audio) || this.fallbackUnlocking.has(audio) || this.fallbackVoices.has(audio)) return;
          // Unlock each reusable media element in the actual touch gesture.
          // Cloning at playback time loses Safari's per-element permission.
          this.fallbackUnlocking.add(audio);
          audio.volume = 0;
          void audio.play().then(() => {
            this.fallbackUnlocked.add(audio);
            if (!this.fallbackVoices.has(audio)) audio.pause();
          }).catch(() => {}).finally(() => { this.fallbackUnlocking.delete(audio); });
        }));
        return;
      }
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
        if (isInteraction(kind)) this.fallbackVoices.forEach((playingKind, audio) => { if (isInteraction(playingKind)) this.releaseFallback(audio); });
        if (this.fallbackVoices.size >= 4) this.releaseFallback(this.fallbackVoices.keys().next().value!);
        const pool = this.fallbackPool.get(kind)!;
        const voice = pool.find(audio => !this.fallbackVoices.has(audio) && audio.readyState >= 2) ?? pool.find(audio => !this.fallbackVoices.has(audio)) ?? pool[0];
        if (this.fallbackVoices.has(voice)) this.finishFallback(voice);
        if (voice.readyState >= 1) voice.currentTime = 0;
        voice.volume = this.preferences.volume / 100 * this.level(kind);
        this.fallbackVoices.set(voice, kind);
        voice.onended = () => this.finishFallback(voice);
        void voice.play().catch(() => this.finishFallback(voice));
        return;
      }
      if (!context || !buffer || !this.output) return;
      if (isInteraction(kind)) this.sources.forEach((voice, source) => { if (isInteraction(voice.kind)) this.releaseSource(source); });
      if (this.sources.size >= 4) this.releaseSource(this.sources.keys().next().value!);
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(this.level(kind), context.currentTime + .006);
      // Keep natural reverb, then reach zero before the buffer ends.
      const duration = buffer.duration;
      if (duration > .02) {
        gain.gain.setValueAtTime(this.level(kind), context.currentTime + Math.max(.006, duration - .04));
        gain.gain.linearRampToValueAtTime(0, context.currentTime + duration);
      }
      source.connect(gain);
      gain.connect(this.output);
      this.sources.set(source, { gain, kind, startedAt: context.currentTime, duration });
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
    const interaction = isInteraction(kind) ? ++this.interactionRevision : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeReadyListener: (() => void) | undefined;
    try {
      const fallback = this.fallback.get(kind);
      // Safari can have metadata before it has playable audio. Wait for this
      // clip, with the same short expiry as a pending AudioContext resume.
      const ready = !fallback || fallback.readyState >= 2 ? Promise.resolve() : new Promise<void>(resolve => {
        const done = () => { removeReadyListener?.(); resolve(); };
        removeReadyListener = () => {
          fallback.removeEventListener("canplay", done);
          fallback.removeEventListener("error", done);
        };
        fallback.addEventListener("canplay", done, { once: true });
        fallback.addEventListener("error", done, { once: true });
      });
      // Some iOS versions leave resume() pending indefinitely. Do not retain a
      // stale startup/confirmation that could play after the next interaction.
      await Promise.race([
        Promise.all([this.unlock(), this.loading, ready]).then(() => this.decode(kind)),
        new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); }),
      ]);
      if (generation === this.generation && (interaction === undefined || interaction === this.interactionRevision) && performance.now() - requestedAt < 1500) this.play(kind, preview);
    } finally { clearTimeout(timer); removeReadyListener?.(); }
  }

  private level(kind: InterfaceSound) {
    return kind === "type" ? .4 : kind === "click" ? .7 : .85;
  }

  private releaseSource(source: AudioBufferSourceNode, immediate = false) {
    const voice = this.sources.get(source);
    if (!voice || !this.context) return;
    const now = this.context.currentTime;
    try {
      // AudioParam.value can already hold the final scheduled zero. Hold the
      // actual envelope at this instant before fading an interrupted voice.
      const elapsed = now - voice.startedAt;
      const level = this.level(voice.kind) * Math.max(0, Math.min(1, elapsed / .006,
        voice.duration > .02 ? (voice.duration - elapsed) / .04 : 1));
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(level, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + (immediate ? 0 : .06));
      source.stop(now + (immediate ? 0 : .065));
    } catch { /* Already ended. */ }
    this.sources.delete(source);
  }

  private finishFallback(audio: HTMLAudioElement) {
    const frame = this.fallbackFades.get(audio);
    if (frame !== undefined) cancelAnimationFrame(frame);
    this.fallbackFades.delete(audio);
    this.fallbackVoices.delete(audio);
    audio.onended = null;
    audio.pause();
  }

  private releaseFallback(audio: HTMLAudioElement, immediate = false) {
    if (immediate || audio.paused) { this.finishFallback(audio); return; }
    if (this.fallbackFades.has(audio)) return;
    const started = performance.now();
    const level = audio.volume;
    const fade = (now: number) => {
      const progress = Math.min(1, (now - started) / 60);
      audio.volume = level * (1 - progress);
      if (progress === 1) this.finishFallback(audio);
      else this.fallbackFades.set(audio, requestAnimationFrame(fade));
    };
    this.fallbackFades.set(audio, requestAnimationFrame(fade));
  }

  stop(immediate = false) {
    this.generation++;
    this.sources.forEach((_voice, source) => this.releaseSource(source, immediate));
    this.fallbackVoices.forEach((_kind, audio) => this.releaseFallback(audio, immediate));
  }

  suspend() {
    this.stop(true);
    this.releaseSession();
    // Safari/iPadOS may keep a stale output even when state says "running".
    this.resetOnUnlock = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (this.context?.state === "running") void this.context.suspend().catch(() => {});
  }

  dispose() {
    this.closed = true;
    this.stop(true);
    this.releaseSession();
    this.controller.abort();
    this.fallbackPool.forEach(pool => pool.forEach(audio => { audio.pause(); audio.removeAttribute("src"); audio.load(); }));
    this.fallbackPool.clear();
    this.fallback.clear();
    void this.context?.close().catch(() => {});
  }
}
