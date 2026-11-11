export type InterfaceAppearance = {
  theme: "original" | "liquid-glass-card" | "ios-premium" | "studio-glass";
  palette: "ocean" | "amethyst" | "graphite";
  transparency: "balanced" | "reduced";
  motion: "full" | "reduced";
};

export const appearanceKey = (uid: string) => `psy-appearance-v1:${uid}`;
export const defaultAppearance: InterfaceAppearance = { theme: "original", palette: "ocean", transparency: "balanced", motion: "full" };

export function readAppearance(raw: string | null): InterfaceAppearance {
  try {
    const value = JSON.parse(raw || "{}") ?? {};
    return {
      theme: ["liquid-glass-card", "ios-premium", "studio-glass"].includes(value.theme) ? value.theme : "original",
      palette: ["ocean", "amethyst", "graphite"].includes(value.palette) ? value.palette : "ocean",
      transparency: value.transparency === "reduced" ? value.transparency : "balanced",
      motion: value.motion === "reduced" ? value.motion : "full",
    };
  } catch { return defaultAppearance; }
}

export function applyAppearance(value: InterfaceAppearance) {
  const root = document.documentElement;
  root.dataset.uiTheme = value.theme;
  root.dataset.glassPalette = value.palette;
  root.dataset.glassTransparency = value.transparency;
  root.dataset.glassMotion = value.motion;
}

// Runs before paint. Only validated, fixed values are assigned to root attributes.
export const appearanceBootstrap = `
(function () {
  try {
    var root = document.documentElement;
    root.dataset.uiTheme = "original";
    root.dataset.glassPalette = "ocean";
    root.dataset.glassTransparency = "balanced";
    root.dataset.glassMotion = "full";
    root.dataset.theme = localStorage.getItem("psy-theme") === "dark" ? "dark" : "light";
  } catch (error) {}
})();
`;
