const THEMES = new Set(["system", "light", "dark"]);
const THEME_STORAGE_KEY = "hh_theme";

function normalizeTheme(value) {
  return THEMES.has(value) ? value : "system";
}

function resolveTheme(theme, prefersDark = false) {
  const normalized = normalizeTheme(theme);
  return normalized === "system" ? (prefersDark ? "dark" : "light") : normalized;
}

module.exports = { THEMES, THEME_STORAGE_KEY, normalizeTheme, resolveTheme };
