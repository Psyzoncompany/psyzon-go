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

test("offline audio caches accept only the known public MP3 files without an authorization header", async () => {
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
