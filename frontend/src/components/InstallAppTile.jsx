/**
 * InstallAppTile
 * --------------------------------------------------------------
 * Drop-in replacement for the "Invest" quick action tile on the
 * Dashboard. When the browser supports native install we call
 * `promptInstall()`; on iOS Safari we fall back to a small helper
 * sheet that walks the user through Share → Add to Home Screen;
 * if the app is already installed the tile shows a checkmark and
 * a "You're all set" hint.
 *
 * The tile visual matches the existing ActionTile pattern in
 * Dashboard.jsx exactly so it slots into the same grid without
 * layout changes.
 */
import React, { useState } from "react";
import { Download, CheckCircle2, Smartphone, Share, Plus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import usePWAInstall from "@/hooks/usePWAInstall";

const GOLD = "#F5C518";
const GLOW = "0 12px 32px -12px rgba(245,197,24,0.55), 0 0 0 1px rgba(245,197,24,0.35)";

export default function InstallAppTile() {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [iosHelperOpen, setIosHelperOpen] = useState(false);

  async function handleClick() {
    if (isInstalled) {
      toast.success("Luckycart Box is already on your home screen.");
      return;
    }
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        toast.success("Installed! Look for the Luckycart Box icon on your home screen.");
      } else if (outcome === "dismissed") {
        toast.info("No worries — you can install anytime from this tile.");
      } else if (isIOS) {
        setIosHelperOpen(true);
      } else {
        toast.info("Open your browser menu and pick 'Install app' or 'Add to home screen'.");
      }
      return;
    }
    if (isIOS) {
      setIosHelperOpen(true);
      return;
    }
    toast.info("Open your browser menu and pick 'Install app' or 'Add to home screen'.");
  }

  const label = isInstalled ? "Installed" : "Install App";
  const Icon = isInstalled ? CheckCircle2 : Download;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        data-testid="install-app-tile"
        className="relative rounded-2xl overflow-hidden text-left transition-all active:scale-[0.98] card-hover"
        style={{ boxShadow: GLOW }}
        aria-label={label}
      >
        {/* Dashed gold accent line top */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
          style={{
            background: `repeating-linear-gradient(90deg,${GOLD} 0 6px,transparent 6px 12px)`,
            opacity: 0.7,
          }}
        />
        {/* Dashed gold accent line bottom */}
        <div
          className="absolute inset-x-0 bottom-0 h-[2px] pointer-events-none z-10"
          style={{
            background: `repeating-linear-gradient(90deg,${GOLD} 0 6px,transparent 6px 12px)`,
            opacity: 0.7,
          }}
        />
        {/* radial glow — sits behind the icon */}
        <div
          className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-30 blur-xl pointer-events-none"
          style={{ background: GOLD }}
        />
        <div className="relative p-3 flex flex-col items-center justify-center gap-2 min-h-[92px] bg-[var(--nb-card)]">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center shadow"
            style={{
              background: `linear-gradient(135deg,#FFE580,${GOLD})`,
              color: "#1A1508",
              boxShadow: "0 4px 14px rgba(245,197,24,0.45)",
            }}
          >
            <Icon className="w-4 h-4" strokeWidth={2.5} />
          </div>
          <div className="text-[11px] font-display font-700 text-white text-center">
            {label}
          </div>
        </div>
      </button>

      {/* iOS helper — Safari has no beforeinstallprompt, so we walk the
          user through the Share → Add to Home Screen flow manually. */}
      <Dialog open={iosHelperOpen} onOpenChange={setIosHelperOpen}>
        <DialogContent
          data-testid="ios-install-helper"
          className="max-w-md border-0 p-0 overflow-hidden bg-[var(--nb-card)]"
          style={{ boxShadow: GLOW }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
               style={{ background: `repeating-linear-gradient(90deg,${GOLD} 0 8px,transparent 8px 14px)`, opacity: 0.8 }} />
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
                  Install Luckycart Box on iPhone
                </DialogTitle>
                <DialogDescription className="text-sm text-[var(--nb-muted)] mt-1">
                  Two quick taps and you're done.
                </DialogDescription>
              </div>
              <button
                onClick={() => setIosHelperOpen(false)}
                data-testid="ios-install-close"
                className="w-8 h-8 rounded-full grid place-items-center text-[var(--nb-muted)] hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-3 mt-4">
              <IosStep
                n={1}
                title="Tap the Share button"
                hint="It's at the bottom of Safari (a square with an up arrow)."
                icon={<Share className="w-4 h-4" strokeWidth={2.5} />}
              />
              <IosStep
                n={2}
                title="Choose 'Add to Home Screen'"
                hint="Scroll if you don't see it — it lives in the second row of actions."
                icon={<Plus className="w-4 h-4" strokeWidth={2.5} />}
              />
              <IosStep
                n={3}
                title="Tap 'Add'"
                hint="Luckycart Box lands on your home screen — open it like any other app."
                icon={<Sparkles className="w-4 h-4" strokeWidth={2.5} />}
              />
            </ol>

            <div className="pt-2">
              <button
                onClick={() => setIosHelperOpen(false)}
                data-testid="ios-install-got-it"
                className="w-full h-11 rounded-full font-display font-800 text-sm transition-all hover:brightness-110 active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg,#FFE580,${GOLD})`,
                  color: "#1A1508",
                  boxShadow: "0 6px 20px rgba(245,197,24,0.45)",
                }}
              >
                Got it
              </button>
            </div>
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
