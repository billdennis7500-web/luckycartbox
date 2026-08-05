/**
 * HowItWorks — a shareable infographic page explaining the 3 core habits
 * of a successful Luckycart Box member. Adapted from the "3 pillars of
 * long-term business" marketing pattern the user shared.
 *
 * Uses ONLY our dark+gold brand palette. Pulls dynamic settings (welcome
 * bonus, referral levels) from the live config so if admin tweaks values
 * this page reflects them automatically.
 */
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import useSWRCache from "@/lib/useSWRCache";
import {
  TrendingUp, Calendar, Users, Target, ShieldCheck, Globe, Zap,
  Trophy, Sparkles, ChevronRight, ArrowRight, Check, Award,
  Coins, ShoppingBag,
} from "lucide-react";

function Pillar({ number, Icon, title, tint, children, testId }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(160deg, ${tint}12 0%, transparent 60%)`,
        border: `1px solid ${tint}40`,
        boxShadow: `0 8px 24px -12px ${tint}50, inset 0 1px 0 rgba(255,255,255,0.03)`,
      }}
      data-testid={testId}
    >
      {/* Big number badge */}
      <div
        className="absolute top-4 left-4 w-11 h-11 rounded-full grid place-items-center font-display font-800 text-lg tabular"
        style={{
          background: `linear-gradient(135deg, ${tint}, ${tint}88)`,
          color: "#0B0906",
          boxShadow: `0 6px 16px -4px ${tint}66`,
        }}
      >
        {number}
      </div>

      <div className="p-4 pl-20">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 shrink-0" style={{ color: tint }} />
          <div className="font-display font-800 text-white text-[15px] leading-tight">
            {title}
          </div>
        </div>
        <div className="mt-2 text-[13px] text-[var(--nb-muted)] leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

function TrustPill({ Icon, tint, title, subtitle }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-[var(--nb-card2)] border border-[var(--nb-border)] p-3">
      <div
        className="w-8 h-8 rounded-lg shrink-0 grid place-items-center"
        style={{ background: `${tint}22`, border: `1px solid ${tint}55`, color: tint }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="font-display font-800 text-white text-xs leading-tight">{title}</div>
        <div className="text-[10px] text-[var(--nb-muted)] leading-tight mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const { data: pub } = useSWRCache("settings:public",
    () => api.get("/settings/public").then((r) => r.data), { fallback: null });

  const siteName     = pub?.site_name || "Luckycart Box";
  const welcomeBonus = pub?.welcome_bonus ?? 500;
  const tiers        = useMemo(() => {
    const raw = pub?.referral_levels || [];
    return [...raw].sort((a, b) => (a.min_referrals || 0) - (b.min_referrals || 0));
  }, [pub]);
  const topTier      = tiers[tiers.length - 1];

  return (
    <div className="space-y-4 pb-6" data-testid="how-it-works">
      {/* ===================== HERO ===================== */}
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #1E1B0A 0%, #0B0906 60%, #050403 100%)",
          boxShadow: "0 24px 60px -20px rgba(245,197,24,0.35), 0 0 0 1px rgba(245,197,24,0.35)",
        }}
      >
        <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle,#F5C518 0%,transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-20 -left-20 w-64 h-64 rounded-full opacity-25 blur-3xl"
             style={{ background: "radial-gradient(circle,#10B981 0%,transparent 70%)" }} />

        <div className="absolute inset-x-0 top-0 h-[2px]"
             style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.85 }} />
        <div className="absolute inset-x-0 bottom-0 h-[2px]"
             style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.85 }} />

        <div className="relative p-6 text-center">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-display font-800 uppercase tracking-widest text-[10px]"
            style={{
              background: "linear-gradient(135deg,#FFE580,#F5C518)",
              color: "#1A1508",
              boxShadow: "0 4px 12px -2px rgba(245,197,24,0.55)",
            }}
          >
            <Sparkles className="w-3 h-3" /> The Playbook
          </div>

          <h1 className="mt-3 font-display font-800 leading-tight tracking-tight text-white text-[26px] sm:text-4xl">
            How to Turn
            <br />
            <span className="text-[#F5C518]">{siteName}</span> into
            <br />
            Your Daily Naira Machine
          </h1>

          <div className="mt-3 mx-auto max-w-md">
            <div className="h-px w-16 mx-auto bg-gradient-to-r from-transparent via-[#F5C518] to-transparent" />
            <p className="mt-2 text-[13px] text-[var(--nb-muted)] leading-relaxed">
              3 core habits to turn {siteName} into your daily naira cash flow — not a get-rich-quick play, but a real long-term business you own.
            </p>
          </div>
        </div>
      </div>

      {/* ===================== 3 PILLARS ===================== */}
      <div className="space-y-3">
        <Pillar
          number="1"
          Icon={TrendingUp}
          title="Compound Daily — Skip the Get-Rich-Quick Trap"
          tint="#F5C518"
          testId="pillar-1"
        >
          Treat every investment as a small, low-risk cashflow move. Your daily profit drops compound over 30 days — small daily wins snowball into serious monthly returns. Reinvest the drops. Watch the box grow.
        </Pillar>

        <Pillar
          number="2"
          Icon={Calendar}
          title="Show Up Daily — Build the Rhythm"
          tint="#10B981"
          testId="pillar-2"
        >
          Log in daily, claim your Daily Bonus Drop, and check the Marketplace for high-tier boxes. Just 5 minutes a day. Consistent daily action is what separates a hobby from a business — and Luckycart Box is designed to reward that discipline.
        </Pillar>

        <Pillar
          number="3"
          Icon={Users}
          title="Build Your Team — Real Leverage"
          tint="#8B5CF6"
          testId="pillar-3"
        >
          Share your unique referral link. Earn 3-tier commission on every friend, plus stack up to{" "}
          <span className="text-white font-800">{topTier ? formatNaira(topTier.reward) : "₦50,000"}</span> in milestone bonuses when your Gen-1 team grows. Your network becomes your net worth.
        </Pillar>
      </div>

      {/* ===================== MOTIVATIONAL BANNER ===================== */}
      <div
        className="relative rounded-2xl overflow-hidden p-5 flex items-center gap-4"
        style={{
          background: "linear-gradient(120deg, #1A1508 0%, #0B0906 100%)",
          border: "1px solid rgba(245,197,24,0.55)",
          boxShadow: "0 12px 30px -12px rgba(245,197,24,0.4)",
        }}
      >
        <div
          className="w-12 h-12 rounded-full shrink-0 grid place-items-center"
          style={{
            background: "linear-gradient(135deg,#FFE580,#F5C518)",
            boxShadow: "0 4px 14px -4px rgba(245,197,24,0.65)",
          }}
        >
          <Trophy className="w-6 h-6 text-[#1A1508]" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-white text-[13px] leading-relaxed">
            Great earnings aren't built on a single lucky day, but on{" "}
            <span className="text-[#FFE580] font-800">daily persistence</span>.
            <br />
            Stop being just a player —{" "}
            <span className="text-[#F5C518] font-800">start becoming a {siteName} owner</span>.
          </div>
        </div>
      </div>

      {/* ===================== ACTION PLAN ===================== */}
      <div className="rounded-2xl bg-[var(--nb-card)] border border-[var(--nb-border)] p-5">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-[#F5C518]" />
          <div className="text-xs uppercase tracking-widest font-display font-800 text-white">
            Your action plan for today
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {[
            {
              Icon: Coins,
              text: (
                <>
                  Log in &amp; claim your{" "}
                  <span className="text-emerald-400 font-800 tabular">{formatNaira(welcomeBonus)}</span>{" "}
                  welcome + daily bonus
                </>
              ),
            },
            {
              Icon: ShoppingBag,
              text: "Pick a starter box in the Marketplace and activate it",
            },
            {
              Icon: Users,
              text: "Copy your invite link and blast it on WhatsApp status",
            },
            {
              Icon: TrendingUp,
              text: "Come back tomorrow — watch the drops stack up in your wallet",
            },
          ].map(({ Icon, text }, i) => (
            <div key={i} className="flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-lg shrink-0 grid place-items-center"
                style={{
                  background: "linear-gradient(135deg,rgba(245,197,24,0.22),rgba(245,197,24,0.08))",
                  border: "1px solid rgba(245,197,24,0.4)",
                  color: "#F5C518",
                }}
              >
                <Check className="w-4 h-4" strokeWidth={2.5} />
              </div>
              <div className="text-[13px] text-white leading-relaxed pt-0.5 flex items-start gap-2 flex-1">
                <Icon className="w-3.5 h-3.5 text-[var(--nb-muted)] shrink-0 mt-[3px]" />
                <span>{text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===================== CTAs ===================== */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/marketplace"
          data-testid="cta-marketplace"
          className="h-12 rounded-xl inline-flex items-center justify-center gap-2 font-display font-800 text-sm text-[#1A1508] active:scale-[0.98] transition"
          style={{
            background: "linear-gradient(135deg,#FFE580 0%,#F5C518 100%)",
            boxShadow: "0 8px 20px -6px rgba(245,197,24,0.6)",
          }}
        >
          <ShoppingBag className="w-4 h-4" /> Browse the Shop
        </Link>
        <Link
          to="/rewards-showcase"
          data-testid="cta-rewards"
          className="h-12 rounded-xl inline-flex items-center justify-center gap-2 font-display font-800 text-sm text-white bg-[var(--nb-card2)] border border-[var(--nb-border)] active:scale-[0.98] transition hover:border-[#F5C518]/40"
        >
          <Award className="w-4 h-4 text-[#F5C518]" /> See Referral Rewards
        </Link>
      </div>

      {/* ===================== BOTTOM TRUST STRIP ===================== */}
      <div className="grid grid-cols-2 gap-2">
        <TrustPill
          Icon={ShieldCheck} tint="#10B981"
          title="Low risk. High reward."
          subtitle="Boxes start from small stakes"
        />
        <TrustPill
          Icon={Calendar} tint="#F5C518"
          title="Daily discipline."
          subtitle="Long-term freedom"
        />
        <TrustPill
          Icon={Users} tint="#8B5CF6"
          title="Build your team."
          subtitle="Build your future"
        />
        <TrustPill
          Icon={Globe} tint="#22D3EE"
          title="Think global."
          subtitle="Earn in Naira"
        />
      </div>

      <div className="text-center pt-2">
        <div className="text-[11px] uppercase tracking-widest font-display font-800 text-[#F5C518]">
          {siteName} — Real people. Real earnings.
        </div>
      </div>
    </div>
  );
}
