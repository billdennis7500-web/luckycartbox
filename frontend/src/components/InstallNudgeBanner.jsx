/**
 * InstallNudgeBanner
 * ---------------------------------------------------------------
 * Slim dismissible banner that lives at the very top of the
 * Dashboard for users who haven't installed the PWA yet.
 *
 * Rules:
 *   • Hidden if the app is already running standalone (installed)
 *   • Hidden if the user tapped "Not now" (persisted in localStorage
 *     with a 7-day cool-off so we don't nag)
 *   • Chrome / Edge / Samsung: taps native install prompt
 *   • iOS Safari: opens a step-by-step Share -> Add to Home Screen sheet
 *
 * Reuses the same `usePWAInstall` hook as InstallAppTile so both
 * surfaces stay in sync (dismissing on one doesn't affect the other).
 */
import React, { useEffect, useState } from "react";
import { Download, X, Smartphone, Share, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import usePWAInstall from "@/hooks/usePWAInstall";

const STORAGE_KEY = "lcb_install_nudge_dismissed_at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const GOLD = "#F5C518";

function wasRecentlyDismissed() {
  try {
    const ts = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (!ts) return false;
    return Date.now() - ts < COOLDOWN_MS;
  } catch {
    return false;
  }
}

export default function InstallNudgeBanner() {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const [iosHelperOpen, setIosHelperOpen] = useState(false);

  useEffect(() => {
    // Only show once we know the install state (after mount).
    setDismissed(wasRecentlyDismissed());
  }, []);

  // Hide when installed or when the browser can't install and isn't iOS.
  if (isInstalled) return null;
  if (!canInstall && !isIOS) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        toast.success("Installed! Look for the Luckycart Box icon on your home screen.");
        setDismissed(true);
      } else if (outcome === "dismissed") {
        // Don't hard-hide — user might still want to install later. Just soft-hide until reload.
        setDismissed(true);
      } else if (isIOS) {
        setIosHelperOpen(true);
      }
      return;
    }
    if (isIOS) {
      setIosHelperOpen(true);
      return;
    }
  };

  return (
    <>
      <div
        data-testid="install-nudge-banner"
        className="relative rounded-xl overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(245,197,24,0.14) 0%, rgba(245,197,24,0.06) 100%)",
          border: `1px solid ${GOLD}55`,
          boxShadow: "0 6px 22px -10px rgba(245,197,24,0.35)",
        }}
      >
        {/* Dashed gold accent line */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
          style={{
            background: `repeating-linear-gradient(90deg,${GOLD} 0 6px,transparent 6px 12px)`,
            opacity: 0.6,
          }}
        />
        <div className="relative flex items-center gap-3 p-3">
          <div
            className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
            style={{
              background: `linear-gradient(135deg,#FFE580,${GOLD})`,
              color: "#1A1508",
              boxShadow: "0 4px 12px rgba(245,197,24,0.35)",
            }}
          >
            <Download className="w-4 h-4" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-display font-800 text-white leading-tight">
              Install Luckycart Box
            </div>
            <div className="text-[11px] text-[var(--nb-muted)] mt-0.5 leading-snug">
              One-tap access, faster loads, works offline.
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstall}
            data-testid="install-nudge-cta"
            className="h-9 px-3 rounded-full font-display font-800 text-xs whitespace-nowrap transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg,#FFE580,${GOLD})`,
              color: "#1A1508",
              boxShadow: "0 4px 12px rgba(245,197,24,0.4)",
            }}
          >
            Install
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            data-testid="install-nudge-dismiss"
            aria-label="Dismiss"
            className="w-7 h-7 rounded-full grid place-items-center text-[var(--nb-muted)] hover:text-white transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS helper */}
      <Dialog open={iosHelperOpen} onOpenChange={setIosHelperOpen}>
        <DialogContent
          data-testid="install-nudge-ios-helper"
          className="max-w-md border-0 p-0 overflow-hidden bg-[var(--nb-card)]"
        >
          <div className="relative p-6 space-y-4 bg-[var(--nb-card)]">
            <div className="flex items-start gap-3">
              <div
                className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                style={{
                  background: `linear-gradient(135deg,#FFE580,${GOLD})`,
                  color: "#1A1508",
                  boxShadow: "0 4px 14px rgba(245,197,24,0.45)",
                }}
              >
                <Smartphone className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <DialogTitle className="font-display text-lg font-800 text-white">
                  Install on iPhone
                </DialogTitle>
                <DialogDescription className="text-sm text-[var(--nb-muted)] mt-1">
                  Two quick taps and you're done.
                </DialogDescription>
              </div>
            </div>
            <ol className="space-y-3 mt-4">
              <IosStep n={1} title="Tap the Share button"
                hint="It's at the bottom of Safari (square with an up arrow)."
                icon={<Share className="w-4 h-4" strokeWidth={2.5} />} />
              <IosStep n={2} title="Choose 'Add to Home Screen'"
                hint="Scroll if you don't see it — it's in the second row."
                icon={<Plus className="w-4 h-4" strokeWidth={2.5} />} />
              <IosStep n={3} title="Tap 'Add'"
                hint="Luckycart Box lands on your home screen."
                icon={<Sparkles className="w-4 h-4" strokeWidth={2.5} />} />
            </ol>
            <button
              onClick={() => setIosHelperOpen(false)}
              data-testid="install-nudge-ios-close"
              className="w-full h-11 rounded-full font-display font-800 text-sm transition-all hover:brightness-110"
              style={{
                background: `linear-gradient(135deg,#FFE580,${GOLD})`,
                color: "#1A1508",
                boxShadow: "0 6px 20px rgba(245,197,24,0.45)",
              }}
            >
              Got it
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IosStep({ n, title, hint, icon }) {
  return (
    <li className="flex items-start gap-3">
      <div
        className="w-8 h-8 rounded-full grid place-items-center shrink-0 text-xs font-display font-800"
        style={{
          background: "rgba(245,197,24,0.15)",
          color: GOLD,
          border: "1px solid rgba(245,197,24,0.40)",
        }}
      >
        {n}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-white font-display font-700 text-sm">
          {icon}
          {title}
        </div>
        <div className="text-xs text-[var(--nb-muted)] mt-0.5 leading-relaxed">{hint}</div>
      </div>
    </li>
  );
}
