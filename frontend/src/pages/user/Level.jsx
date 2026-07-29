/**
 * Level — /level
 *
 * Shows the user's current level (large tier chip + progress bar to next tier)
 * and the full 10-level ladder underneath so they can see what's ahead. All
 * levels use the shared `deriveLevel` helper so the UI never drifts from the
 * canonical calculation.
 */
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatNaira } from "@/lib/api";
import { LEVELS, deriveLevel } from "@/lib/levels";
import { ArrowLeft, Sparkles, ChevronRight, Trophy, Lock, CheckCircle2 } from "lucide-react";
import { SectionHeader, SoftCard, MicroLabel } from "@/components/design";

export default function Level() {
  const { user } = useAuth();
  const { current, next, index, progressPct } = deriveLevel(user?.total_invested || 0);

  return (
    <div className="space-y-5">
      <Link to="/profile" data-testid="level-back"
            className="inline-flex items-center gap-1 text-xs text-[var(--nb-muted)] hover:text-white transition-colors">
        <ArrowLeft className="w-3 h-3" /> Back to profile
      </Link>

      {/* Current level hero */}
      <div
        className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-5 text-center"
        style={{ boxShadow: `0 10px 32px -10px ${current.color}66, 0 0 0 1px ${current.color}40` }}
        data-testid="level-hero"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
             style={{ background: `repeating-linear-gradient(90deg,${current.color} 0 10px,transparent 10px 18px)`, opacity: 0.7 }} />
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none"
             style={{ background: current.color }} />

        <div
          className="mx-auto w-16 h-16 rounded-2xl grid place-items-center mb-3"
          style={{
            background: `linear-gradient(135deg,${current.color},${current.color}CC)`,
            color: current.color === "#F5C518" ? "#1A1508" : "#FFFFFF",
            boxShadow: `0 8px 22px ${current.color}55`,
          }}
        >
          <Trophy className="w-7 h-7" strokeWidth={2.4} />
        </div>
        <div className="relative">
          <MicroLabel tone="gold" className="!mt-0 justify-center">Current level · {index + 1} / {LEVELS.length}</MicroLabel>
          <div className="font-display font-800 text-2xl text-white mt-1" data-testid="level-current-name">
            {current.name}
          </div>
          <div className="text-xs text-[var(--nb-muted)] mt-1">
            {current.perk}
          </div>

          {/* Progress bar to next */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-[var(--nb-muted)] font-display font-700 mb-1.5">
              <span>Progress</span>
              <span className="tabular text-white">
                {formatNaira(user?.total_invested || 0)}
                {next && <> / {formatNaira(next.threshold)}</>}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-[var(--nb-card2)]">
              <div
                className="h-full transition-all"
                data-testid="level-progress-bar"
                style={{
                  width: `${progressPct}%`,
                  background: `linear-gradient(90deg,${current.color},${(next || current).color})`,
                  boxShadow: `0 0 12px ${current.color}80`,
                }}
              />
            </div>
            <div className="mt-2 text-[11px] text-[var(--nb-muted)]">
              {next
                ? <>Buy {formatNaira(Math.max(0, next.threshold - (user?.total_invested || 0)))} more to reach <span className="text-white font-display font-700">{next.name}</span>.</>
                : "You've reached the highest tier. Legend status."}
            </div>
          </div>
        </div>
      </div>

      {/* Ladder */}
      <SectionHeader title="All levels" />
      <div className="space-y-2">
        {LEVELS.map((lvl, i) => {
          const status = i < index ? "done" : i === index ? "current" : "locked";
          const StatusIcon = status === "done" ? CheckCircle2 : status === "current" ? Sparkles : Lock;
          return (
            <div
              key={lvl.key}
              data-testid={`level-row-${lvl.key}`}
              className="relative rounded-xl overflow-hidden bg-[var(--nb-card)] p-3 flex items-center gap-3"
              style={{
                boxShadow: status === "current"
                  ? `0 6px 20px -6px ${lvl.color}88, 0 0 0 2px ${lvl.color}`
                  : `0 2px 8px -4px ${lvl.color}44, 0 0 0 1px ${lvl.color}20`,
                opacity: status === "locked" ? 0.55 : 1,
              }}
            >
              <div
                className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                style={{
                  background: `linear-gradient(135deg,${lvl.color},${lvl.color}AA)`,
                  color: lvl.color === "#F5C518" ? "#1A1508" : "#FFFFFF",
                  boxShadow: `0 4px 12px ${lvl.color}55`,
                }}
              >
                <span className="font-display font-800 text-sm">{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-display font-800 text-white text-sm truncate">{lvl.name}</div>
                  <span
                    className="inline-flex items-center gap-1 text-[9px] font-display font-800 uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
                    style={{
                      background: `${lvl.color}18`,
                      color: lvl.color,
                      border: `1px solid ${lvl.color}55`,
                    }}
                  >
                    <StatusIcon className="w-2.5 h-2.5" />
                    {status === "done" ? "Reached" : status === "current" ? "You're here" : "Locked"}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--nb-muted)] mt-0.5">{lvl.perk}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)] font-display font-700">Spend</div>
                <div className="font-display font-800 tabular text-white text-sm">
                  {lvl.threshold === 0 ? "₦0" : formatNaira(lvl.threshold)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* How to level up */}
      <SoftCard testid="level-help">
        <MicroLabel tone="gold">How to level up</MicroLabel>
        <div className="mt-2 text-xs text-[var(--nb-muted)] leading-relaxed">
          Your level is based on the total naira you've spent buying products in the shop. Every purchase adds to your lifetime spend — you keep the level even after a product finishes.
        </div>
        <Link
          to="/marketplace"
          data-testid="level-shop-cta"
          className="mt-4 inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-display font-800 transition-all hover:brightness-110 active:scale-[0.97]"
          style={{
            background: "linear-gradient(135deg,#FFE580,#F5C518)",
            color: "#1A1508",
            boxShadow: "0 6px 18px rgba(245,197,24,0.45)",
          }}
        >
          Shop products <ChevronRight className="w-3 h-3" />
        </Link>
      </SoftCard>
    </div>
  );
}
