import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { defaultSoundPreferences, interfaceSoundFiles, readSoundPreferences, soundPreferenceKey } from "../app/interface-sound-model";

test("sound preferences stay account-scoped and invalid volume cannot produce an unbounded gain", () => {
  assert.notEqual(soundPreferenceKey("one"), soundPreferenceKey("two"));
  for (const value of [null, "null", "invalid", "{}", "[]"]) assert.deepEqual(readSoundPreferences(value), defaultSoundPreferences);
  assert.equal(readSoundPreferences('{"volume":500}').volume, 100);
  assert.equal(readSoundPreferences('{"volume":-5}').volume, 0);
  assert.equal(readSoundPreferences('{"volume":"loud"}').volume, 18);
  assert.deepEqual(readSoundPreferences('{"enabled":false,"volume":12,"type":false}'), { ...defaultSoundPreferences, enabled: false, volume: 12, type: false });
});

test("new PS5 actions inherit an existing disabled click preference", () => {
  const old = readSoundPreferences('{"click":false}');
  assert.equal(old.navigate, false);
  assert.equal(old.close, false);
  assert.equal(readSoundPreferences('{"click":false,"navigate":true}').navigate, true);
});

test("offline audio caches accept only known public effects without an authorization header", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const scope = { URL, self: { addEventListener() {}, location: { origin: "https://psyzon.test" } } };
  vm.createContext(scope);
  vm.runInContext(worker, scope);
  function allowed(path: string, authenticated = false) {
    return vm.runInContext(`isPublicStaticRequest({ method: "GET", destination: "", headers: { has: () => ${authenticated} } }, new URL(${JSON.stringify(path)}, "https://psyzon.test"))`, scope);
  }
  for (const path of Object.values(interfaceSoundFiles)) {
    assert.equal(allowed(path), true);
    assert.equal(allowed(path, true), false);
  }
  assert.equal(allowed("/sounds/click-v1.mp3"), false);
  assert.equal(allowed("/api/private.mp3"), false);
  assert.equal(allowed("/private.mp3"), false);
  assert.equal(allowed("https://elsewhere.test/sounds/click-v1.mp3"), false);
});

test("PS5 action WAVs retain stereo PCM quality, headroom and silent boundaries", async () => {
  const clips = [interfaceSoundFiles.click, interfaceSoundFiles.navigate, interfaceSoundFiles.close];
  assert.equal(new Set(clips).size, 3);
  for (const path of clips) {
    const bytes = await readFile(new URL(`../public${path}`, import.meta.url));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.readUInt16LE(20), 1, "lossless PCM");
    assert.equal(bytes.readUInt16LE(22), 2, "stereo");
    assert.equal(bytes.readUInt32LE(24), 48000);
    assert.equal(bytes.readUInt16LE(34), 16);
    if (path === interfaceSoundFiles.navigate) assert.ok((bytes.length - 44) / 192000 >= .35, "short WAVs need enough trailing silence for WebKit media preroll");
    const samples = [];
    for (let i = 44; i < bytes.length; i += 2) samples.push(bytes.readInt16LE(i));
    assert.ok(samples.every(value => Math.abs(value) <= 16424), "at least 6 dB of headroom");
    assert.equal(samples[0], 0);
    assert.equal(samples[1], 0);
    assert.ok(samples.slice(-3840).every(value => value === 0), "40 ms of silent tail");
    assert.ok(samples.slice(2).every((value, i) => Math.abs(value - samples[i]) < 3277), "no large sample discontinuity in either channel");
  }
});
