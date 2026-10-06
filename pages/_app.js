import { useEffect } from "react";
import "../styles/globals.css";
import ThemeToggle from "../components/theme/ThemeToggle";
import { THEME_STORAGE_KEY, normalizeTheme, resolveTheme } from "../lib/theme.cjs";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // 注册 PWA Service Worker。版本更新和旧缓存清理由 sw.js 自己管理。
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const stored = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
    document.documentElement.dataset.theme = resolveTheme(stored, prefersDark);
    document.documentElement.dataset.themePreference = stored;
  }, []);

  return <><Component {...pageProps} /><ThemeToggle /></>;
}
