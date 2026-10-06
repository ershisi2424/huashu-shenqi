import { useEffect, useMemo, useState } from "react";
import { THEME_STORAGE_KEY, normalizeTheme, resolveTheme } from "../../lib/theme.cjs";

const LABELS = { system: "跟随系统", light: "浅色", dark: "暗色" };
const ORDER = ["system", "dark", "light"];

function applyTheme(preference) {
  const prefersDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(preference, prefersDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  return resolved;
}

export default function ThemeToggle({ className = "" }) {
  const [preference, setPreference] = useState("system");
  const [mounted, setMounted] = useState(false);
  const resolved = useMemo(() => mounted
    ? resolveTheme(preference, window.matchMedia?.("(prefers-color-scheme: dark)").matches === true)
    : "light", [mounted, preference]);

  useEffect(() => {
    const stored = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    setPreference(stored);
    setMounted(true);
    applyTheme(stored);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (preference === "system") applyTheme("system");
    };
    media?.addEventListener?.("change", handleSystemChange);
    return () => media?.removeEventListener?.("change", handleSystemChange);
  }, [preference]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    applyTheme(preference);
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    window.dispatchEvent(new CustomEvent("hh-theme-change", { detail: { preference, resolved } }));
  }, [preference, resolved]);

  const cycleTheme = () => {
    const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
    setPreference(next);
  };

  return <button type="button" className={`globalThemeToggle ${className}`.trim()} onClick={cycleTheme} aria-label={`主题：${LABELS[preference]}，当前${resolved}，点击切换`} title={`主题：${LABELS[preference]}`} data-theme-toggle>
    <span aria-hidden="true">{resolved === "dark" ? "☀" : "☾"}</span>
    <span className="globalThemeToggleLabel">{LABELS[preference]}</span>
  </button>;
}
