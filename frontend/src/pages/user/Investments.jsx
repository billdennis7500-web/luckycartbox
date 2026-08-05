import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import useSWRCache from "@/lib/useSWRCache";
import { TrendingUp, CheckCircle2, Sparkles, Timer, Calendar, ChevronRight, Coins } from "lucide-react";
import { AmbientCard, SectionHeader, MicroLabel, PillCTA, TIER_TOKENS } from "@/components/design";

/* -------------- skeleton for perceived-fast load -------------- */
function InvestmentSkeleton() {
  return (
    <div
      className="relative rounded-2xl overflow-hidden animate-pulse"
      style={{ boxShadow: "0 6px 24px -8px rgba(245,197,24,0.20), 0 0 0 1px rgba(245,197,24,0.10)" }}
      data-testid="inv-skeleton"
    >
      <div className="relative bg-[var(--nb-card)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="h-5 w-2/5 rounded bg-[var(--nb-card2)]" />
          <div className="h-4 w-16 rounded-full bg-[var(--nb-card2)]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-14 rounded-lg bg-[var(--nb-card2)]" />
          <div className="h-14 rounded-lg bg-[var(--nb-card2)]" />
          <div className="h-14 rounded-lg bg-[var(--nb-card2)]" />
        </div>
        <div className="h-2 w-full rounded-full bg-[var(--nb-card2)]" />
      </div>
    </div>
  );
}

/* -------------- helpers -------------- */
function nextPayoutText(inv) {
  if (inv.status === "completed") return "Completed";
  const start = inv.last_drop_at ? new Date(inv.last_drop_at) : new Date(inv.created_at);
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const diff = next - Date.now();
  if (diff <= 0) return "Any moment now";
  const h = Math.floor(diff / 3.6e6);
  const m = Math.floor((diff % 3.6e6) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}
/* Tier auto-derivation mirrors Marketplace.jsx so the badge stays consistent */
function tierForInv(inv) {
  const key = inv.product_tier || (
    (inv.daily_profit_pct || 0) >= 10 ? "legendary"
    : (inv.daily_profit_pct || 0) >= 7  ? "epic"
    : (inv.daily_profit_pct || 0) >= 5  ? "hot"
    : "gold"
  );
  const tokens = TIER_TOKENS[key] || TIER_TOKENS.gold;
  const labels = { legendary: "Legendary", epic: "Epic", hot: "Hot", newcomer: "Newcomer", tech: "Tech", fashion: "Fashion", gold: "Standard" };
  return { key, label: labels[key] || "Standard", ...tokens };
}
function initials(s = "") {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "IN";
}

/* -------------- ring progress -------------- */
function Ring({ pct = 0, tone = "#F5C518", size = 56 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden>
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--nb-border)" strokeWidth={4} fill="none" />
      <circle
        cx={size/2} cy={size/2} r={r} stroke={tone} strokeWidth={4} fill="none"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
      <text
        x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="var(--nb-text)" fontSize={size < 60 ? 11 : 13} fontFamily="Outfit" fontWeight={700}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

/* -------------- plan row — dark-gold ambient horizontal card w/ thumbnail -------------- */
function InvestmentCard({ inv }) {
  const tier = tierForInv(inv);
  const done = inv.status === "completed";
  const progress = Math.min(100, Math.round((inv.drops_done / inv.duration_days) * 100));
  const roiPct = inv.price ? (inv.total_earned / inv.price) * 100 : 0;
  const dailyEarn = (inv.price || 0) * ((inv.daily_profit_pct || 0) / 100);
  const projected = dailyEarn * (inv.duration_days || 0);
  const remaining = Math.max(0, projected - inv.total_earned);
  const glow = done ? "#94A3B8" : tier.glow;

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      data-testid={`inv-row-${inv.id}`}
      style={{ boxShadow: `0 6px 32px -8px ${glow}55, 0 0 0 1px ${glow}25` }}
    >
      {/* Dashed accent lines top + bottom */}
      <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
           style={{ background: `repeating-linear-gradient(90deg,${glow} 0 8px,transparent 8px 14px)`, opacity: 0.55 }} />
      <div className="absolute inset-x-0 bottom-0 h-[2px] pointer-events-none z-10"
           style={{ background: `repeating-linear-gradient(90deg,${glow} 0 8px,transparent 8px 14px)`, opacity: 0.55 }} />

      <div
        className="relative bg-[var(--nb-card)]"
      >
        {/* Top row: thumbnail + name + status */}
        <div className="p-4 flex items-center gap-3">
          {/* 60x60 thumbnail with tier glow — stays dark for image contrast */}
          <div
            data-nb-image="dark"
            className="relative w-16 h-16 rounded-xl grid place-items-center shrink-0 overflow-hidden"
            style={{
              background: `radial-gradient(circle at center,${tier.glow}44,${tier.glow}10 55%,transparent 80%),linear-gradient(135deg,#1E1B0A,#0B0906)`,
              border: `1px solid ${glow}40`,
            }}
          >
            {inv.product_image_url ? (
              <img
                src={inv.product_image_url}
                alt=""
                className="relative w-full h-full object-cover"
                data-testid={`inv-thumb-${inv.id}`}
              />
            ) : (
              <div
                className="font-display font-800 text-lg"
                style={{ color: tier.glow }}
              >
                {initials(inv.product_name)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-display font-700 uppercase tracking-wider text-[9px]"
                style={{ background: tier.chipBg, color: tier.chipFg }}
                data-testid={`inv-tier-${inv.id}`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {tier.label}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-display font-700 shrink-0"
                style={done ? {
                  background: "#94A3B818", color: "#94A3B8", border: "1px solid #94A3B840",
                } : {
                  background: "#10B98118", color: "#10B981", border: "1px solid #10B98140",
                }}
              >
                {done ? (
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />Completed</span>
                ) : "Active"}
              </span>
            </div>
            <div className="font-display font-800 text-white truncate leading-tight">{inv.product_name}</div>
            <div className="text-[11px] text-[var(--nb-muted)] tabular truncate mt-0.5">
              {formatNaira(inv.price)} · {inv.daily_profit_pct}% / day · {inv.duration_days} days
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-4">
          {/* Daily earning strip — gold accent */}
          <div className="mb-4 rounded-xl px-3 py-2 flex items-center justify-between"
               style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)" }}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#10B981]/85 font-display font-700">
              <Coins className="w-3 h-3" /> Daily earnings
            </div>
            <div className="font-display font-800 tabular text-[#10B981]" data-testid={`inv-daily-${inv.id}`}>
              +{formatNaira(dailyEarn)}
              <span className="text-[10px] text-[#10B981]/70 font-500 ml-1">/ day</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Ring pct={progress} tone={glow} />
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#F5C518]/80 font-display font-700">Earned</div>
                <div className="mt-0.5 tabular font-display font-800 text-[#10B981]">
                  {formatNaira(inv.total_earned)}
                </div>
                <div className="text-[10px] text-[var(--nb-muted)] tabular">ROI {roiPct.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#F5C518]/80 font-display font-700">Remaining</div>
                <div className="mt-0.5 tabular font-display font-800 text-white">
                  {formatNaira(remaining)}
                </div>
                <div className="text-[10px] text-[var(--nb-muted)] tabular">
                  {Math.max(0, inv.duration_days - inv.drops_done)} days left
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-[var(--nb-muted)]">
              <Timer className="w-3 h-3" />
              Next payout <span className="text-white tabular ml-1">{nextPayoutText(inv)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[var(--nb-muted)]">
              <Calendar className="w-3 h-3" />
              <span className="tabular">{inv.drops_done} / {inv.duration_days}</span>
            </span>
          </div>

          <div className="mt-3 h-1.5 rounded-full overflow-hidden"
               style={{ background: "rgba(245,197,24,0.12)" }}>
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                background: done ? "#94A3B8" : `linear-gradient(90deg,${glow},${glow}80)`,
                boxShadow: done ? "none" : `0 0 12px ${glow}80`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Investments() {
  const { data: invs = [], loading } =
    useSWRCache("investments", () => api.get("/investments").then((r) => r.data), { fallback: [] });
  const [tab, setTab] = useState("active");
  const [, setNowTick] = useState(0);

  // Ticker: force a re-render every second so the countdown seconds tick live
  // without extra API calls.
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const active = invs.filter((i) => i.status === "active");
  const completed = invs.filter((i) => i.status === "completed");
  const shown = tab === "active" ? active : tab === "completed" ? completed : invs;

  const totalActive = active.reduce((s, i) => s + (i.price || 0), 0);
  const totalEarned = invs.reduce((s, i) => s + (i.total_earned || 0), 0);
  const projectedRemaining = active.reduce((s, i) => {
    const projected = i.price * (i.daily_profit_pct / 100) * i.duration_days;
    return s + Math.max(0, projected - i.total_earned);
  }, 0);

  return (
    <div className="space-y-6" data-testid="investments-page">
      {/* Portfolio hero — gold ambient card */}
      <AmbientCard tone="gold" testid="investments-hero">
        <div>
          <MicroLabel tone="gold">Warehouse value</MicroLabel>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="font-display font-800 text-4xl tabular text-white tracking-tight" data-testid="inv-total-active">
              {formatNaira(totalActive)}
            </div>
            <span className="text-[11px] text-[var(--nb-muted)]">
              across {active.length} active plan{active.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl p-3"
                 style={{ background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)" }}>
              <MicroLabel><span className="text-[#10B981]">Earned so far</span></MicroLabel>
              <div className="mt-1 tabular font-display font-800 text-[#10B981]" data-testid="inv-total-earned">
                {formatNaira(totalEarned)}
              </div>
            </div>
            <div className="rounded-xl p-3"
                 style={{ background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.28)" }}>
              <MicroLabel tone="gold">Projected remaining</MicroLabel>
              <div className="mt-1 tabular font-display font-800 text-white" data-testid="inv-projected-remaining">
                {formatNaira(projectedRemaining)}
              </div>
            </div>
          </div>
        </div>
      </AmbientCard>

      <SectionHeader
        title="My purchases"
        testid="investments-heading"
        right={
          <Link to="/marketplace" className="text-xs text-[#F5C518] hover:underline flex items-center gap-1 shrink-0 font-display font-700">
            Browse products <ChevronRight className="w-3 h-3" />
          </Link>
        }
      />

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-[var(--nb-card)] border border-[var(--nb-border)]">
        {[
          { k: "active",    label: `Active (${active.length})`,       tid: "tab-active" },
          { k: "completed", label: `Completed (${completed.length})`, tid: "tab-completed" },
          { k: "all",       label: `All (${invs.length})`,            tid: "tab-all" },
        ].map(({ k, label, tid }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={tid}
            className={`h-9 text-xs rounded-lg font-display font-700 transition-colors ${
              tab === k ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30" : "text-[var(--nb-muted)] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3" data-testid="inv-loading">
          <InvestmentSkeleton />
          <InvestmentSkeleton />
        </div>
      ) : shown.length === 0 ? (
        <div className="relative rounded-2xl overflow-hidden"
             style={{ boxShadow: "0 6px 24px -8px #F5C51844, 0 0 0 1px #F5C51820" }}
             data-testid="inv-empty">
          <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
               style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 8px,transparent 8px 14px)", opacity: 0.55 }} />
          <div className="absolute inset-x-0 bottom-0 h-[2px] pointer-events-none z-10"
               style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 8px,transparent 8px 14px)", opacity: 0.55 }} />
          <div className="relative p-8 text-center space-y-3 bg-[var(--nb-card)]">
            <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center"
                 style={{ background: "linear-gradient(135deg,#FFE580,#F5C518)",
                          boxShadow: "0 4px 20px rgba(245,197,24,0.35)" }}>
              <TrendingUp className="w-6 h-6 text-[#1A1508]" />
            </div>
            <div className="text-sm text-[var(--nb-muted)]">
              {tab === "active"
                ? "No active purchases yet."
                : tab === "completed"
                ? "No completed purchases yet."
                : "You haven't bought any product yet."}
            </div>
            <div className="flex justify-center pt-1">
              <Link to="/marketplace">
                <PillCTA tone="purple" size="md" icon={TrendingUp} testid="inv-empty-cta">
                  Browse products
                </PillCTA>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((i) => <InvestmentCard key={i.id} inv={i} />)}
        </div>
      )}
    </div>
  );
}
