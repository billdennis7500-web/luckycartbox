/**
 * usePWAInstall
 * -------------------------------------------------------------
 * Centralises everything the "Install App" button needs to know:
 *
 *   canInstall  — Chrome/Edge/Samsung has fired `beforeinstallprompt`
 *                 and we still have the deferred event to trigger.
 *   isInstalled — the site is already running in standalone mode
 *                 (installed on the home screen) OR the browser has
 *                 fired `appinstalled` since page load.
 *   isIOS       — Safari on iPhone/iPad. `beforeinstallprompt` will
 *                 never fire here, so we need to show a helper.
 *   promptInstall() — programmatically opens the native install
 *                 sheet on eligible browsers. Returns the outcome
 *                 (`"accepted"` / `"dismissed"` / `"unavailable"`).
 *
 * The hook stores the deferred event on `window` so hot-reload
 * during development doesn't lose it.
 */
import { useEffect, useState, useCallback } from "react";

const isStandalone = () =>
  (typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true));

const detectIOS = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || "";
  // iPadOS 13+ reports as Mac — sniff via touch support too.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && "ontouchend" in document)
  );
};

export default function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(
    Boolean(typeof window !== "undefined" && window.__nbDeferredInstall)
  );
  const [isInstalled, setIsInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      window.__nbDeferredInstall = e;
      setCanInstall(true);
    };
    const onInstalled = () => {
      window.__nbDeferredInstall = null;
      setCanInstall(false);
      setIsInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const evt = typeof window !== "undefined" ? window.__nbDeferredInstall : null;
    if (!evt) return "unavailable";
    try {
      evt.prompt();
      const choice = await evt.userChoice;
      window.__nbDeferredInstall = null;
      setCanInstall(false);
      if (choice?.outcome === "accepted") setIsInstalled(true);
      return choice?.outcome || "dismissed";
    } catch {
      return "unavailable";
    }
  }, []);

  return {
    canInstall,
    isInstalled,
    isIOS: detectIOS(),
    promptInstall,
  };
}
