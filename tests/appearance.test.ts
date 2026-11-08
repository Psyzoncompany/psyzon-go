import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { appearanceBootstrap, appearanceKey, defaultAppearance, readAppearance } from "../app/interface-appearance";

test("appearance defaults to original and validates each saved preference independently", () => {
  for (const raw of [null, "null", "{broken", "[]", "false"]) assert.deepEqual(readAppearance(raw), defaultAppearance);
  const saved = { theme: "liquid-glass-card", palette: "amethyst", transparency: "reduced", motion: "reduced" } as const;
  assert.deepEqual(readAppearance(JSON.stringify(saved)), saved);
  assert.deepEqual(readAppearance(JSON.stringify({ ...saved, theme: "automatic", palette: "unknown" })), { ...saved, theme: "original", palette: "ocean" });
});

test("prepaint starts original until authentication identifies the account and storage keys isolate users", () => {
  assert.notEqual(appearanceKey("user-a"), appearanceKey("user-b"));
  const saved = new Map([[appearanceKey("user-a"), JSON.stringify({ theme: "liquid-glass-card" })]]);
  assert.equal(readAppearance(saved.get(appearanceKey("user-a")) ?? null).theme, "liquid-glass-card");
  assert.equal(readAppearance(saved.get(appearanceKey("user-b")) ?? null).theme, "original");
  for (const raw of [null, "{}", JSON.stringify({ theme: "liquid-glass-card", palette: "graphite", transparency: "reduced", motion: "reduced" }), JSON.stringify({ theme: "invalid", palette: "invalid" })]) {
    const dataset: Record<string, string> = {};
    runInNewContext(appearanceBootstrap, { document: { documentElement: { dataset } }, localStorage: { getItem: (key: string) => key === "psy-theme" ? "dark" : raw } });
    assert.equal(dataset.uiTheme, defaultAppearance.theme);
    assert.equal(dataset.glassPalette, defaultAppearance.palette);
    assert.equal(dataset.glassTransparency, defaultAppearance.transparency);
    assert.equal(dataset.glassMotion, defaultAppearance.motion);
    assert.equal(dataset.theme, "dark");
  }
  assert.doesNotThrow(() => runInNewContext(appearanceBootstrap, { localStorage: { getItem: () => { throw new Error("Blocked"); } } }));
});
