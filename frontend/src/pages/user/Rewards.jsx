/**
 * Rewards — /rewards
 *
 * A dedicated page for milestone/referrer reward LEVELS (distinct from the
 * network view at /referrals which lists gen-1/2/3 people). Users see:
 *   • Their current level badge + progress bar to the next tier
 *   • Live count of qualifying referrals
 *   • Total earned so far
 *   • Every configured level as a card with lock/unlock/claimed state
 *   • Claim button when a tier is unlocked and unclaimed
 *
 * All level thresholds, rewards, names, colours and the qualifying rule
 * (must-invest yes/no) are admin-configurable from /admin/settings.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError, formatNaira } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft,
  Flame,
  Rocket,
  Trophy,
  Crown,
  Gem,
  Sparkles,
  Lock,
  Check,
  ChevronRight,
  Users,
} from "lucide-react";
import { SectionHeader, MicroLabel } from "@/components/design";

const ICON_MAP = {
  flame: Flame,
  rocket: Rocket,
  trophy: Trophy,
  crown: Crown,
  gem: Gem,
  sparkles: Sparkles,
};

function TierIcon({ name, className = "" }) {
  const Icon = ICON_MAP[name] || Gem;
  return <Icon className={className} strokeWidth={2.3} />;
}

function ProgressBar({ pct, tone }) {
  return (
    <div className="w-full h-2 rounded-full bg-[var(--nb-card2)] overflow-hidden" data-testid="rewards-progress-bar">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: `linear-gradient(90deg,${tone} 0%,${tone}CC 100%)`,
          boxShadow: `0 0 10px ${tone}80`,
        }}
      />
    </div>
  );
}

function TierCard({ tier, onClaim, claiming }) {
  const locked = !tier.unlocked;
  const claimed = tier.claimed;

  return (
    <div
      className="relative rounded-2xl overflow-hidden p-4 flex items-center gap-4 bg-[var(--nb-card)]"
      data-testid={`rewards-tier-${tier.level}`}
      style={{
        border: `1px solid ${locked ? "var(--nb-border)" : `${tier.color}66`}`,
        boxShadow: locked
          ? "0 4px 14px -6px rgba(0,0,0,0.20)"
          : `0 8px 24px -10px ${tier.color}55, inset 0 0 0 1px ${tier.color}22`,
        opacity: locked ? 0.75 : 1,
      }}
    >
      {!locked && (
        <div
          aria-hidden
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-25 blur-2xl pointer-events-none"
          style={{ background: tier.color }}
        />
      )}

      {/* Level medallion */}
      <div className="relative shrink-0">
        <div
          className="w-14 h-14 rounded-2xl grid place-items-center relative overflow-hidden"
          style={{
            background: locked
              ? "linear-gradient(135deg,var(--nb-card2),var(--nb-border))"
              : `linear-gradient(135deg,${tier.color} 0%, ${tier.color}CC 60%, ${tier.color}88 100%)`,
            color: locked ? "var(--nb-muted)" : "#FFFFFF",
            boxShadow: locked ? "none" : `0 6px 18px ${tier.color}66`,
          }}
        >
          {!locked && (
            <span
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(120% 80% at 22% 18%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 55%)",
              }}
            />
          )}
          <TierIcon name={tier.icon} className="relative w-6 h-6" />
        </div>
        {/* Level number chip */}
        <div
          className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full grid place-items-center text-[10px] font-display font-800 tabular border-2"
          style={{
            background: locked ? "var(--nb-card)" : tier.color,
            color: locked ? "var(--nb-muted)" : "#FFFFFF",
            borderColor: locked ? "var(--nb-border)" : `${tier.color}`,
          }}
        >
          {tier.level}
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-display font-800 text-white text-base truncate" data-testid={`rewards-tier-${tier.level}-name`}>
            {tier.name}
          </div>
          {claimed && (
            <span
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-display font-700 uppercase tracking-wider"
              style={{ background: `${tier.color}22`, color: tier.color, border: `1px solid ${tier.color}55` }}
              data-testid={`rewards-tier-${tier.level}-claimed-pill`}
            >
              <Check className="w-3 h-3" /> Claimed
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--nb-muted)] mt-0.5">
          <span className="tabular">{tier.min_referrals}</span> qualifying referrals
        </div>
        <div className="mt-1 font-display font-800 tabular text-white text-lg" style={{ color: locked ? "var(--nb-muted)" : tier.color }}>
          {formatNaira(tier.reward)}
        </div>
      </div>

      {/* Action */}
      <div className="shrink-0">
        {claimed ? (
          <div className="w-10 h-10 rounded-full grid place-items-center" style={{ background: `${tier.color}22`, color: tier.color }} aria-label="Claimed">
            <Check className="w-4 h-4" />
          </div>
        ) : tier.claimable ? (
          <button
            onClick={() => onClaim(tier)}
            disabled={claiming === tier.level}
            data-testid={`rewards-claim-${tier.level}`}
            className="h-10 px-4 rounded-full font-display font-800 text-sm text-black transition-transform active:scale-95 disabled:opacity-60"
            style={{
              background: `linear-gradient(135deg,${tier.color} 0%, ${tier.color}CC 100%)`,
              boxShadow: `0 6px 16px ${tier.color}66`,
            }}
          >
            {claiming === tier.level ? "Claiming…" : "Claim"}
          </button>
        ) : (
          <div className="w-10 h-10 rounded-full grid place-items-center border border-[var(--nb-border)] text-[var(--nb-muted)]" aria-label="Locked">
            <Lock className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Rewards() {
  const [data, setData] = useState(null);
  const [claiming, setClaiming] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/referrals/rewards");
      setData(r.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load rewards");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const claim = async (tier) => {
    setClaiming(tier.level);
    try {
      const r = await api.post(`/referrals/rewards/claim/${tier.level}`);
      toast.success(`🎉 ${tier.name} unlocked — ₦${Number(r.data.credited).toLocaleString()} credited`);
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Claim failed");
    } finally {
      setClaiming(0);
    }
  };

  if (!data) {
    return (
      <div className="space-y-4" data-testid="rewards-skeleton">
        <div className="animate-pulse rounded-2xl bg-[var(--nb-card)] h-40" />
        <div className="animate-pulse rounded-2xl bg-[var(--nb-card)] h-20" />
        <div className="animate-pulse rounded-2xl bg-[var(--nb-card)] h-20" />
        <div className="animate-pulse rounded-2xl bg-[var(--nb-card)] h-20" />
      </div>
    );
  }

  const currentTier = data.tiers.find((t) => t.level === data.current_level);
  const nextTier = data.tiers.find((t) => t.level === data.next_level);
  const heroColor = currentTier?.color || nextTier?.color || "#F5C518";

  return (
    <div className="space-y-5">
      {/* Back header */}
      <div className="flex items-center gap-2">
        <Link
          to="/referrals"
          data-testid="rewards-back-link"
          className="w-9 h-9 rounded-full grid place-items-center border border-[var(--nb-border)] text-[var(--nb-muted)] hover:text-white hover:border-[#F5C518]/40"
          aria-label="Back to referrals"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <SectionHeader
          title="Reward Levels"
          subtitle="Unlock milestone bonuses as your network grows."
          testid="rewards-heading"
          className="!m-0"
        />
      </div>

      {/* Hero — progress card. Uses var(--nb-card) so it flips white in
          light-mode; the gold radial glow + tier-tinted border/shadow
          provides the "treasure card" aesthetic on both themes. */}
      <div
        className="relative rounded-2xl overflow-hidden p-5 bg-[var(--nb-card)]"
        data-testid="rewards-hero"
        style={{
          border: `1px solid ${heroColor}55`,
          boxShadow: `0 12px 40px -14px ${heroColor}55, inset 0 0 0 1px ${heroColor}18`,
        }}
      >
        {/* Warm gold wash overlay — visible on both light + dark surfaces */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            background: `linear-gradient(135deg, ${heroColor}12 0%, ${heroColor}05 55%, ${heroColor}00 100%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute -top-24 -right-16 w-72 h-72 rounded-full opacity-40 blur-2xl pointer-events-none"
          style={{ background: `radial-gradient(closest-side,${heroColor},transparent)` }}
        />

        <div className="relative flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl grid place-items-center shrink-0 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg,${heroColor} 0%, ${heroColor}CC 60%, ${heroColor}88 100%)`,
              color: "#FFFFFF",
              boxShadow: `0 10px 24px ${heroColor}55`,
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(120% 80% at 20% 15%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%)",
              }}
            />
            <TierIcon name={currentTier?.icon || nextTier?.icon || "sparkles"} className="w-7 h-7 relative" />
          </div>
          <div className="min-w-0 flex-1">
            <MicroLabel tone="gold" className="!mt-0">Current status</MicroLabel>
            <div className="font-display font-800 text-white text-2xl mt-0.5 truncate" data-testid="rewards-current-level">
              {data.current_level_name}
            </div>
            <div className="text-xs text-[var(--nb-muted)]">
              {data.requires_investment
                ? "Counting friends who have invested"
                : "Counting all invited friends"}
            </div>
          </div>
        </div>

        {/* Progress row */}
        <div className="relative mt-5">
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-xs text-[var(--nb-muted)]">
              {nextTier ? (
                <>
                  Progress to <span className="text-white font-display font-700">{nextTier.name}</span>
                </>
              ) : (
                "All levels unlocked 🎉"
              )}
            </div>
            <div className="text-xs tabular text-white font-display font-700" data-testid="rewards-progress-text">
              {data.count}{nextTier ? ` / ${nextTier.min_referrals}` : ""}
            </div>
          </div>
          <ProgressBar pct={data.progress_pct} tone={nextTier?.color || heroColor} />
          {nextTier && (
            <div className="mt-2 text-xs text-[var(--nb-muted)]">
              <span className="text-white font-display font-700 tabular">{data.next_level_needs}</span> more to unlock {formatNaira(nextTier.reward)}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="relative mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[var(--nb-card2)] p-3 border border-[var(--nb-border)]">
            <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Qualifying refs</div>
            <div className="mt-1 flex items-center gap-1.5 font-display font-800 text-white text-xl tabular" data-testid="rewards-qualifying-count">
              <Users className="w-4 h-4 text-[var(--nb-muted)]" />
              {data.count}
            </div>
          </div>
          <div className="rounded-xl bg-[var(--nb-card2)] p-3 border border-[var(--nb-border)]">
            <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Total earned</div>
            <div className="mt-1 font-display font-800 text-white text-xl tabular" data-testid="rewards-total-earned">
              {formatNaira(data.total_earned || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Invite CTA — quick link */}
      <Link
        to="/referrals"
        data-testid="rewards-invite-cta"
        className="flex items-center justify-between rounded-xl border border-[var(--nb-border)] bg-[var(--nb-card)] p-3 hover:border-[#F5C518]/40"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--nb-card2)] grid place-items-center text-[#F5C518]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm text-white font-display font-700">Invite more friends</div>
            <div className="text-xs text-[var(--nb-muted)]">Share your code, grow the network faster</div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-[var(--nb-muted)]" />
      </Link>

      {/* Tier list */}
      <SectionHeader title="All levels" className="!mb-2" />
      <div className="space-y-2.5">
        {data.tiers.map((t) => (
          <TierCard key={t.level} tier={t} onClaim={claim} claiming={claiming} />
        ))}
        {data.tiers.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--nb-border)] p-6 text-center text-sm text-[var(--nb-muted)]" data-testid="rewards-empty">
            No reward levels configured yet. Ask the admin to add tiers.
          </div>
        )}
      </div>
    </div>
  );
}
