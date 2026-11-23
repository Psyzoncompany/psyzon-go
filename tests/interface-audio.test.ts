import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { InterfaceAudio } from "../app/interface-audio";
import { defaultSoundPreferences, interfaceSoundFiles } from "../app/interface-sound-model";

function browser(t: TestContext, ios = true) {
  const contexts: Context[] = [];
  const starts: { length: number }[] = [];
  let stallResume = false;
  const pending: (() => void)[] = [];
  const document = { hidden: false };
  const session = { type: "auto" };
  class Source {
    buffer?: { length: number };
    onended?: () => void;
    connect() {}
    disconnect() {}
    stop() { this.onended?.(); }
    start() { if (this.buffer) starts.push(this.buffer); }
  }
  class Context {
    state = "suspended";
    sampleRate = 48000;
    currentTime = 0;
    destination = {};
    resumes = 0;
    gains: { gain: { value: number; setTargetAtTime(value: number): void }; connect(): void; disconnect(): void }[] = [];
    get gain() { return this.gains[0]; }
    constructor() { contexts.push(this); }
    createGain() {
      const gain = { gain: { value: 0, setTargetAtTime(value: number) { this.value = value; } }, connect() {}, disconnect() {} };
      this.gains.push(gain);
      return gain;
    }
    createBufferSource() { return new Source(); }
    createBuffer() { return { length: 1 }; }
    async decodeAudioData() { return { length: 16 }; }
    resume() {
      this.resumes++;
      return new Promise<void>(resolve => {
        const complete = () => { this.state = "running"; resolve(); };
        if (stallResume) pending.push(complete);
        else queueMicrotask(complete);
      });
    }
    async suspend() { this.state = "suspended"; }
    async close() { this.state = "closed"; }
  }
  const values = {
    window: { AudioContext: Context },
    document,
    navigator: { userAgent: ios ? "iPhone" : "Desktop", platform: ios ? "iPhone" : "Linux", maxTouchPoints: ios ? 5 : 0, audioSession: session },
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
  };
  for (const [key, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return { contexts, starts, document, session, stall() { stallResume = true; }, release() { pending.splice(0).forEach(resolve => resolve()); } };
}

test("preloading before the first tap does not create a locked context; the tap decodes every action", async t => {
  const env = browser(t);
  const audio = new InterfaceAudio({ ...defaultSoundPreferences });
  t.after(() => audio.dispose());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.contexts.length, 0);
  const playback = audio.playWhenReady("success");
  assert.equal(env.contexts.length, 1, "creation must happen before the gesture handler returns");
  assert.equal(env.contexts[0].resumes, 1);
  assert.equal(env.starts[0].length, 1, "prime Safari synchronously with a silent sample");
  await playback;
  for (const kind of Object.keys(interfaceSoundFiles) as (keyof typeof interfaceSoundFiles)[]) audio.play(kind, true);
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 5);
  assert.equal(env.contexts[0].gain.gain.value, .18);
});

test("an interrupted iPhone context resumes rather than silently discarding the next sound", async t => {
  const env = browser(t);
  const audio = new InterfaceAudio({ ...defaultSoundPreferences });
  t.after(() => audio.dispose());
  await audio.playWhenReady("click");
  env.contexts[0].state = "interrupted";
  await audio.preview("success");
  assert.equal(env.contexts[0].state, "running");
  assert.equal(env.contexts[0].resumes, 2);
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 2);
});

test("returning to the iPhone app renews the output on a tap, retaining loaded sounds and volume", async t => {
  const env = browser(t);
  const audio = new InterfaceAudio({ ...defaultSoundPreferences, volume: 31 });
  t.after(() => audio.dispose());
  await audio.preview("click");
  env.document.hidden = true;
  audio.suspend();
  env.document.hidden = false;
  await audio.unlock(false);
  assert.equal(env.contexts.length, 1, "visibility alone must not create an unactivated context");
  await audio.preview("notification");
  assert.equal(env.contexts.length, 2);
  assert.equal(env.contexts[0].state, "closed");
  assert.equal(env.contexts[1].gain.gain.value, .31);
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 2);
});

test("desktop restores the existing context instead of replacing it", async t => {
  const env = browser(t, false);
  const audio = new InterfaceAudio({ ...defaultSoundPreferences });
  t.after(() => audio.dispose());
  await audio.preview("click");
  audio.suspend();
  await audio.unlock(false);
  await audio.preview("click");
  assert.equal(env.contexts.length, 1);
  assert.equal(env.contexts[0].resumes, 2);
});

test("muting, zero volume, hidden pages and disabled action preferences prevent sounds", async t => {
  const env = browser(t);
  const audio = new InterfaceAudio({ ...defaultSoundPreferences, enabled: false });
  t.after(() => audio.dispose());
  await audio.preview("click");
  assert.equal(env.contexts.length, 0);
  audio.configure({ ...defaultSoundPreferences, volume: 0 });
  await audio.preview("click");
  assert.equal(env.contexts.length, 0);
  audio.configure({ ...defaultSoundPreferences, click: false });
  await audio.playWhenReady("click");
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 0);
  await audio.preview("click");
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 1);
  env.document.hidden = true;
  await audio.preview("success");
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 1);
});

test("a delayed resume cannot play an old confirmation after backgrounding or disposal", async t => {
  const env = browser(t);
  const audio = new InterfaceAudio({ ...defaultSoundPreferences });
  t.after(() => audio.dispose());
  env.stall();
  const playback = audio.playWhenReady("success");
  audio.suspend();
  env.release();
  await playback;
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 0);
  audio.dispose();
  await audio.preview("click");
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 0);
});

test("an indefinitely pending Safari resume expires without a delayed sound", async t => {
  const env = browser(t);
  const audio = new InterfaceAudio({ ...defaultSoundPreferences });
  t.after(() => audio.dispose());
  env.stall();
  await audio.playWhenReady("success");
  env.release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 0);
});

test("iPhone effects use media volume and release the session when muted, hidden or disposed", async t => {
  const env = browser(t);
  const audio = new InterfaceAudio({ ...defaultSoundPreferences });
  t.after(() => audio.dispose());
  assert.equal(env.session.type, "auto");
  await audio.preview("click");
  assert.equal(env.session.type, "playback");
  audio.configure({ ...defaultSoundPreferences, enabled: false });
  assert.equal(env.session.type, "auto");
  audio.configure({ ...defaultSoundPreferences });
  await audio.unlock();
  assert.equal(env.session.type, "playback");
  audio.suspend();
  assert.equal(env.session.type, "auto");
  await audio.unlock(false);
  assert.equal(env.session.type, "auto");
  await audio.preview("success");
  assert.equal(env.session.type, "playback");
  audio.dispose();
  assert.equal(env.session.type, "auto");
});

test("an existing recording session is preserved", async t => {
  const env = browser(t);
  env.session.type = "play-and-record";
  const audio = new InterfaceAudio({ ...defaultSoundPreferences });
  t.after(() => audio.dispose());
  await audio.preview("success");
  assert.equal(env.session.type, "play-and-record");
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 1);
});

test("unsupported audio-session setters cannot prevent playback", async t => {
  const env = browser(t);
  Object.defineProperty(env.session, "type", { get: () => "auto", set: () => { throw new Error("Unsupported"); } });
  const audio = new InterfaceAudio({ ...defaultSoundPreferences });
  t.after(() => audio.dispose());
  await audio.preview("click");
  assert.equal(env.starts.filter(buffer => buffer.length === 16).length, 1);
});
