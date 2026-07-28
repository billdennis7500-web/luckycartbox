/*  Light / Dark theme provider — polished second-attempt after the previous
 *  light-mode rollback. Persists the choice in localStorage under `nb-theme`.
 *  Applies `html.theme-light` when active; the CSS variables in index.css
 *  override every `--nb-*` token when that class is present. Defaults to dark.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext({ theme: "dark", toggle: () => {}, set: () => {} });

const STORAGE_KEY = "nb-theme";

function readInitialTheme() {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "light") {
      html.classList.add("theme-light");
      html.style.colorScheme = "light";
    } else {
      html.classList.remove("theme-light");
      html.style.colorScheme = "dark";
    }
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      set: setTheme,
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
