import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "nb-theme"; // "dark" | "light"

function applyTheme(mode) {
  const el = document.documentElement;
  if (mode === "light") el.classList.add("theme-light");
  else el.classList.remove("theme-light");
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return window.localStorage.getItem(STORAGE_KEY) || "dark";
  });

  useEffect(() => {
    applyTheme(mode);
    try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* private mode */ }
  }, [mode]);

  const toggle = () => setMode((m) => (m === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ mode, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
