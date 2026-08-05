/**
 * RewardsShowcase — a shareable, promo-style infographic page for the
 * 5-tier referral-level rewards. Designed to look like a marketing poster
 * users can screenshot and blast on WhatsApp/Telegram status.
 *
 * Uses ONLY our dark+gold brand palette (var(--nb-*), #F5C518, #FFE580,
 * #10B981 emerald, #8B5CF6 sovereign purple, #22D3EE titan cyan).
 * Pulls the current tier config live from /api/settings/public so if
 * admin changes the tiers, this page updates instantly.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import useSWRCache from "@/lib/useSWRCache";
import {
  Flame, Rocket, Trophy, Crown, Gem, Send, Share2, MessageCircle,
  Copy, ChevronRight, Infinity as InfinityIcon, ShieldCheck, Lock, Zap,
  Sparkles, TrendingUp, Users, Check, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

/* Map DEFAULT tier icon slug → lucide component + tint override so the
   promo colors POP even if admin tweaks the tier palette. */
const TIER_META = {
  flame:  { Icon: Flame,   tint: "#F97316" },
  rocket: { Icon: Rocket,  tint: "#10B981" },
  trophy: { Icon: Trophy,  tint: "#F5C518" },
  crown:  { Icon: Crown,   tint: "#8B5CF6" },
  gem:    { Icon: Gem,     tint: "#22D3EE" },
};

function TierCard({ tier, i }) {
  const meta = TIER_META[tier.icon] || TIER_META.flame;
  const { Icon, tint } = meta;
  return (
    <div
      className="relative rounded-2xl overflow-hidden text-center"
      style={{
        background: `linear-gradient(160deg, ${tint}18 0%, transparent 60%)`,
        border: `1px solid ${tint}45`,
        boxShadow: `0 6px 24px -10px ${tint}55, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
      data-testid={`tier-card-${tier.level}`}
    >
      {/* Rank pill */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
        <div
          className="w-8 h-8 rounded-full grid place-items-center font-display font-800 text-sm text-[#1A1508] tabular"
          style={{
            background: "linear-gradient(135deg,#FFE580,#F5C518)",
            boxShadow: "0 4px 12px -2px rgba(245,197,24,0.55)",
          }}
        >
          {i + 1}
        </div>
      </div>

      <div className="pt-6 pb-4 px-3">
        {/* Icon halo */}
        <div className="relative mx-auto w-14 h-14 grid place-items-center mb-2">
          <div className="absolute inset-0 rounded-full blur-lg opacity-50" style={{ background: tint }} />
          <div
            className="relative w-14 h-14 rounded-full grid place-items-center"
            style={{
              background: `linear-gradient(135deg, ${tint} 0%, ${tint}88 100%)`,
              boxShadow: `0 6px 18px -4px ${tint}88, inset 0 2px 6px rgba(255,255,255,0.2)`,
            }}
          >
            <Icon className="w-7 h-7 text-white" strokeWidth={2.2} />
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-widest font-display font-800 mt-2"
             style={{ color: tint }}>
          {tier.name}
        </div>
        <div className="mt-1 font-display font-800 text-white text-lg leading-tight">
          Invite <span className="tabular">{tier.min_referrals}</span>
        </div>
        <div className="text-[10px] text-[var(--nb-muted)]">active friends</div>

        {/* Reward pill */}
        <div
          className="mt-3 rounded-lg py-1.5 px-2"
          style={{
            background: "linear-gradient(135deg,rgba(245,197,24,0.18),rgba(245,197,24,0.05))",
            border: "1px solid rgba(245,197,24,0.45)",
          }}
        >
          <div className="text-[8px] uppercase tracking-widest font-display font-700 text-[#F5C518]/80">
            Cash reward
          </div>
          <div className="font-display font-800 tabular text-[#FFE580] text-base leading-tight">
            {formatNaira(tier.reward)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RewardsShowcase() {
  const { user } = useAuth();
  const { data: pub } = useSWRCache("settings:public",
    () => api.get("/settings/public").then((r) => r.data), { fallback: null });

  const tiers = useMemo(() => {
    const raw = pub?.referral_levels || [];
    return [...raw].sort((a, b) => (a.min_referrals || 0) - (b.min_referrals || 0));
  }, [pub]);

  const totalStack = useMemo(
    () => tiers.reduce((s, t) => s + (t.reward || 0), 0),
    [tiers],
  );
  const topTier = tiers[tiers.length - 1];
  const siteName = pub?.site_name || "Luckycart Box";

  const inviteUrl = useMemo(() => {
    if (!user?.referral_code) return `${window.location.origin}/register`;
    return `${window.location.origin}/register?ref=${user.referral_code}`;
  }, [user]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied — paste it anywhere");
    } catch {
      toast.error("Copy failed — long-press the link to copy manually");
    }
  };

  const shareWa = () => {
    const msg = `Yo — I'm stacking daily naira with ${siteName}. Refer people & claim up to ${topTier ? formatNaira(topTier.reward) : "₦50,000"} cash. My link 👉 ${inviteUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };
  const shareTg = () => {
    const msg = `Stacking daily naira with ${siteName}. Refer people & claim up to ${topTier ? formatNaira(topTier.reward) : "₦50,000"} cash.`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="space-y-4 pb-6" data-testid="rewards-showcase">
      {/* ===================== HERO ===================== */}
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #1E1B0A 0%, #0B0906 60%, #050403 100%)",
          boxShadow: "0 24px 60px -20px rgba(245,197,24,0.35), 0 0 0 1px rgba(245,197,24,0.35)",
        }}
      >
        {/* Radial glow accents */}
        <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-45 blur-3xl"
             style={{ background: "radial-gradient(circle,#F5C518 0%,transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle,#10B981 0%,transparent 70%)" }} />

        {/* Dashed gold accents top+bottom */}
        <div className="absolute inset-x-0 top-0 h-[2px]"
             style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.85 }} />
        <div className="absolute inset-x-0 bottom-0 h-[2px]"
             style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.85 }} />

        <div className="relative p-6 pb-5 text-center">
          {/* Trumpet chip */}
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-display font-800 uppercase tracking-widest text-[10px]"
            style={{
              background: "linear-gradient(135deg,#FFE580,#F5C518)",
              color: "#1A1508",
              boxShadow: "0 4px 12px -2px rgba(245,197,24,0.55)",
            }}
          >
            <Sparkles className="w-3 h-3" /> Daily Referral Cash
          </div>

          <h1 className="mt-3 font-display font-800 leading-tight tracking-tight text-white text-[28px] sm:text-4xl">
            Spread the Wealth
            <br />
            <span className="text-[#F5C518]">&amp; Get Paid.</span>
          </h1>

          <p className="mt-3 text-[13px] text-[var(--nb-muted)] max-w-md mx-auto leading-relaxed">
            Want pure naira cash without opening a single box? Our{" "}
            <span className="text-white font-700">5 milestone bonuses</span> are LIVE.
            The more friends you bring, the more <span className="text-emerald-400 font-700">FREE cash</span> you unlock.
          </p>

          {/* Combined-total pill */}
          {totalStack > 0 && (
            <div
              className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
              style={{
                background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(245,197,24,0.14))",
                border: "1px solid rgba(245,197,24,0.55)",
              }}
              data-testid="rewards-total-stack"
            >
              <InfinityIcon className="w-3.5 h-3.5 text-[#F5C518]" />
              <span className="text-[11px] text-[var(--nb-muted)] uppercase tracking-widest font-display font-700">
                All tiers stack
              </span>
              <span className="text-sm font-display font-800 tabular text-white">
                = {formatNaira(totalStack)}
              </span>
            </div>
          )}
        </div>

        {/* ===================== TIER LADDER ===================== */}
        <div className="relative px-3 pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {tiers.map((t, i) => <TierCard key={t.level || i} tier={t} i={i} />)}
          </div>
        </div>
      </div>

      {/* ===================== WEALTH LOOP CTA ===================== */}
      <div
        className="rounded-2xl p-5 flex items-start gap-4"
        style={{
          background: "linear-gradient(135deg, #1A1508 0%, #0B0906 100%)",
          border: "1px solid rgba(245,197,24,0.35)",
        }}
      >
        <div
          className="w-12 h-12 rounded-full shrink-0 grid place-items-center"
          style={{
            background: "linear-gradient(135deg,#FFE580,#F5C518)",
            boxShadow: "0 4px 14px -4px rgba(245,197,24,0.65)",
          }}
        >
          <InfinityIcon className="w-6 h-6 text-[#1A1508]" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest font-display font-800 text-[#F5C518]">
            The Ultimate Wealth Loop
          </div>
          <div className="mt-1 text-sm text-white leading-relaxed">
            All 5 tiers are <span className="font-800 text-[#FFE580]">100% ACCUMULATIVE</span>.
            Invite {topTier?.min_referrals || 100} active friends and pocket
            {" "}<span className="font-800 tabular text-emerald-400">
              {formatNaira(totalStack || 72000)}
            </span> pure cash — in less than 24 hours.
          </div>
        </div>
      </div>

      {/* ===================== SHARE STRIP ===================== */}
      <div className="rounded-2xl bg-[var(--nb-card)] border border-[var(--nb-border)] p-4 space-y-3"
           data-testid="share-strip">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-[#F5C518]" />
          <span className="text-xs uppercase tracking-widest font-display font-800 text-white">
            Your invite arsenal
          </span>
        </div>

        <div className="rounded-lg bg-[var(--nb-card2)] border border-[var(--nb-border)] p-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-[var(--nb-muted)] uppercase tracking-widest font-display font-700">Your link</div>
            <div className="text-xs tabular text-white truncate mt-0.5">{inviteUrl}</div>
          </div>
          <button
            onClick={copyLink}
            data-testid="copy-invite-link"
            className="shrink-0 inline-flex items-center gap-1 px-3 h-9 rounded-lg text-[11px] font-display font-800 text-[#1A1508]"
            style={{ background: "linear-gradient(135deg,#FFE580,#F5C518)" }}
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={shareWa}
            data-testid="share-whatsapp"
            className="h-11 rounded-xl inline-flex items-center justify-center gap-2 font-display font-800 text-sm text-white active:scale-[0.98] transition"
            style={{
              background: "linear-gradient(135deg,#25D366,#128C7E)",
              boxShadow: "0 8px 20px -6px rgba(37,211,102,0.5)",
            }}
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
          <button
            onClick={shareTg}
            data-testid="share-telegram"
            className="h-11 rounded-xl inline-flex items-center justify-center gap-2 font-display font-800 text-sm text-white active:scale-[0.98] transition"
            style={{
              background: "linear-gradient(135deg,#229ED9,#1976BB)",
              boxShadow: "0 8px 20px -6px rgba(34,158,217,0.5)",
            }}
          >
            <Send className="w-4 h-4" /> Telegram
          </button>
        </div>

        <p className="text-[11px] text-[var(--nb-muted)] leading-relaxed pt-1">
          Hurry — copy your exclusive referral link, blast it into your WhatsApp status and Telegram groups, and lead your team to daily financial freedom!
        </p>
      </div>

      {/* ===================== VIEW YOUR PROGRESS CTA ===================== */}
      <Link
        to="/rewards"
        data-testid="view-progress-cta"
        className="rounded-2xl block relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg,#FFE580 0%,#F5C518 100%)",
          boxShadow: "0 12px 30px -10px rgba(245,197,24,0.65)",
        }}
      >
        <div className="p-5 flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-[#1A1508] shrink-0" strokeWidth={2.5} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest font-display font-800 text-[#1A1508]/70">
              Track your progress
            </div>
            <div className="font-display font-800 text-[#1A1508] text-base leading-tight">
              See your current tier &amp; claim rewards
            </div>
          </div>
          <ChevronRight className="w-6 h-6 text-[#1A1508] shrink-0" strokeWidth={2.5} />
        </div>
      </Link>

      {/* ===================== BOTTOM TRUST STRIP ===================== */}
      <div className="grid grid-cols-3 gap-2 pt-2">
        <div className="rounded-xl bg-[var(--nb-card2)] border border-[var(--nb-border)] p-3 text-center">
          <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto" />
          <div className="mt-1 text-[10px] uppercase tracking-widest font-display font-800 text-white">100% Authentic</div>
        </div>
        <div className="rounded-xl bg-[var(--nb-card2)] border border-[var(--nb-border)] p-3 text-center">
          <Lock className="w-4 h-4 text-[#F5C518] mx-auto" />
          <div className="mt-1 text-[10px] uppercase tracking-widest font-display font-800 text-white">Secure &amp; Safe</div>
        </div>
        <div className="rounded-xl bg-[var(--nb-card2)] border border-[var(--nb-border)] p-3 text-center">
          <Zap className="w-4 h-4 text-purple-400 mx-auto" />
          <div className="mt-1 text-[10px] uppercase tracking-widest font-display font-800 text-white">Instant Rewards</div>
        </div>
      </div>

      {/* Footer tagline */}
      <div className="text-center pt-2">
        <div className="text-[11px] uppercase tracking-widest font-display font-800 text-[#F5C518]">
          {siteName} — Rewards That Pay Daily
        </div>
      </div>
    </div>
  );
}
