/**
 * MilestoneListener — invisible global component that polls
 *   GET /api/referrals/rewards
 * every ~90 seconds. When the response includes `newly_unlocked` tiers,
 * fire a big celebratory toast + a canvas-confetti burst tinted to each
 * tier's brand color, then POST /api/referrals/rewards/acknowledge so the
 * toast fires exactly ONCE per tier — even if the user reloads or hops
 * devices.
 *
 * Rendering nothing keeps this decoupled from every page's layout —
 * mount once in App.js inside the authenticated user shell.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { api, formatNaira } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const POLL_MS = 90_000;

function fireConfetti(color) {
  // Two-stage burst: a wide fountain from the bottom, then two side jets
  const base = { spread: 90, ticks: 200, gravity: 0.9, scalar: 1.1 };
  confetti({
    ...base,
    particleCount: 80,
    startVelocity: 55,
    origin: { x: 0.5, y: 0.9 },
    colors: [color, "#FFFFFF", "#FFE580"],
  });
  setTimeout(() => {
    confetti({ ...base, particleCount: 45, angle: 60,  startVelocity: 55, origin: { x: 0, y: 0.9 }, colors: [color, "#F5C518"] });
    confetti({ ...base, particleCount: 45, angle: 120, startVelocity: 55, origin: { x: 1, y: 0.9 }, colors: [color, "#F5C518"] });
  }, 220);
}

export default function MilestoneListener() {
  const { user } = useAuth();
  const inFlight = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    // Only run for authenticated non-admin users. Admins don't have
    // qualifying refs and don't need reward toasts.
    if (!user || user.role === "admin") return;

    const check = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const { data } = await api.get("/referrals/rewards");
        const newly = data.newly_unlocked || [];
        if (newly.length > 0) {
          // Fire one toast per tier (usually 1, occasionally 2 if the user
          // crosses multiple thresholds via a big invited-user burst).
          for (const t of newly) {
            fireConfetti(t.color || "#F5C518");
            toast.success(
              `🎉 ${t.name} unlocked — ₦${Number(t.reward).toLocaleString()} bonus ready to claim!`,
              {
                description: "Head to Rewards to claim your milestone bonus.",
                duration: 8000,
                action: {
                  label: "Claim",
                  onClick: () => (window.location.href = "/rewards"),
                },
              },
            );
          }
          // Acknowledge so the toast doesn't re-fire on next poll / device.
          try { await api.post("/referrals/rewards/acknowledge"); } catch {}
        }
      } catch {
        // Silent — this is a background enhancement, not critical UX
      } finally {
        inFlight.current = false;
      }
    };

    // Fire once on mount, then poll every POLL_MS. Also refire when the
    // dashboard emits a `wallet:refresh` event (e.g. after a redeem).
    check();
    timer.current = setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id, user?.role]);

  return null;
}
