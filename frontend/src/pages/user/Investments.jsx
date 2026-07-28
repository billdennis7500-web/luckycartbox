import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TrendingUp, CheckCircle2, Sparkles, Timer, Calendar, ChevronRight } from "lucide-react";
import { AmbientCard, SectionHeader, MicroLabel, PillCTA } from "@/components/design";

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
function tint(name = "") {
  const palette = [
    { bg: "#0055FF", to: "#0A2A6C" },
    { bg: "#10B981", to: "#064E3B" },
    { bg: "#F59E0B", to: "#78350F" },
    { bg: "#8B5CF6", to: "#3B1E7E" },
    { bg: "#EF4444", to: "#7F1D1D" },
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}
function initials(s = "") {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "IN";
}

/* -------------- ring progress -------------- */
function Ring({ pct = 0, tone = "#0055FF", size = 56 }) {
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

/* -------------- plan row -------------- */
function InvestmentCard({ inv }) {
  const brand = tint(inv.product_name);
  const done = inv.status === "completed";
  const progress = Math.min(100, Math.round((inv.drops_done / inv.duration_days) * 100));
  const roiPct = inv.price ? (inv.total_earned / inv.price) * 100 : 0;
  const dailyEarn = (inv.price || 0) * ((inv.daily_profit_pct || 0) / 100);
  const projected = dailyEarn * (inv.duration_days || 0);
  const remaining = Math.max(0, projected - inv.total_earned);

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-[var(--nb-border)] bg-[var(--nb-card)]"
      data-testid={`inv-row-${inv.id}`}
    >
      {/* header strip */}
      <div
        className="relative p-4 flex items-center gap-3 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${brand.bg}, ${brand.to})` }}
      >
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative w-12 h-12 rounded-xl bg-white/15 grid place-items-center font-display font-800 text-white shrink-0">
          {initials(inv.product_name)}
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="font-display font-800 text-white truncate">{inv.product_name}</div>
          <div className="text-xs text-white/80 tabular">
            {formatNaira(inv.price)} · {inv.daily_profit_pct}% / day · {inv.duration_days} days
          </div>
        </div>
        <span className={`relative text-[10px] px-2 py-0.5 rounded-full border shrink-0 backdrop-blur-sm ${
          done
            ? "bg-white/10 text-white/80 border-white/20"
            : "bg-[#10B981]/25 text-white border-[#10B981]/50"
        }`}>
          {done ? (
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Completed</span>
          ) : "Active"}
        </span>
      </div>

      {/* body */}
      <div className="p-4">
        {/* Daily earning strip */}
        <div className="mb-4 rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#10B981]/90">
            <Timer className="w-3 h-3" /> Daily earnings
          </div>
          <div className="font-display font-800 tabular text-[#10B981]" data-testid={`inv-daily-${inv.id}`}>
            +{formatNaira(dailyEarn)}
            <span className="text-[10px] text-[#10B981]/70 font-500 ml-1">/ day</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Ring pct={progress} tone={done ? "#94A3B8" : brand.bg} />
          <div className="flex-1 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Earned</div>
              <div className="mt-0.5 tabular font-display font-700 text-[#10B981]">
                {formatNaira(inv.total_earned)}
              </div>
              <div className="text-[10px] text-[var(--nb-muted)] tabular">ROI {roiPct.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Remaining</div>
              <div className="mt-0.5 tabular font-display font-700 text-white">
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

        <div className="mt-3 h-1.5 rounded-full bg-[var(--nb-border)] overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${progress}%`,
              background: done ? "#94A3B8" : `linear-gradient(90deg, ${brand.bg}, ${brand.to})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Investments() {
  const [invs, setInvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");
  const [, setNowTick] = useState(0);

  const load = () => {
    setLoading(true);
    api.get("/investments").then((r) => setInvs(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

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
          <MicroLabel tone="gold">Portfolio value</MicroLabel>
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
        title="My investments"
        testid="investments-heading"
        right={
          <Link to="/marketplace" className="text-xs text-[#F5C518] hover:underline flex items-center gap-1 shrink-0 font-display font-700">
            Browse plans <ChevronRight className="w-3 h-3" />
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
        <div className="rounded-xl border border-dashed border-[var(--nb-border)] p-8 text-center text-sm text-[var(--nb-muted)]" data-testid="inv-loading">
          Loading investments…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--nb-border)] p-8 text-center space-y-3" data-testid="inv-empty">
          <Sparkles className="w-6 h-6 text-[#0055FF] mx-auto" />
          <div className="text-sm text-[var(--nb-muted)]">
            {tab === "active"
              ? "No active investments yet."
              : tab === "completed"
              ? "No completed investments yet."
              : "You haven't started any investment plan."}
          </div>
          <Link to="/marketplace">
            <Button className="h-10 bg-[#0055FF] hover:bg-[#3377FF]" data-testid="inv-empty-cta">
              <TrendingUp className="w-4 h-4 mr-1.5" /> Browse plans
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((i) => <InvestmentCard key={i.id} inv={i} />)}
        </div>
      )}
    </div>
  );
}
