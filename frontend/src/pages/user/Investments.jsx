import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TrendingUp, CheckCircle2, Sparkles, Timer, Calendar, ChevronRight } from "lucide-react";

/* -------------- helpers -------------- */
function nextPayoutText(inv) {
  if (inv.status === "completed") return "Completed";
  const start = inv.last_drop_at ? new Date(inv.last_drop_at) : new Date(inv.created_at);
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const diff = next - Date.now();
  if (diff <= 0) return "Any moment now";
  const h = Math.floor(diff / 3.6e6);
  const m = Math.floor((diff % 3.6e6) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
      <circle cx={size/2} cy={size/2} r={r} stroke="#1A2B44" strokeWidth={4} fill="none" />
      <circle
        cx={size/2} cy={size/2} r={r} stroke={tone} strokeWidth={4} fill="none"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
      <text
        x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="#F8FAFC" fontSize={size < 60 ? 11 : 13} fontFamily="Outfit" fontWeight={700}
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
  const projected = inv.price * (inv.daily_profit_pct / 100) * inv.duration_days;
  const remaining = Math.max(0, projected - inv.total_earned);

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-[#1A2B44] bg-[#0B1524]"
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
        <div className="flex items-center gap-4">
          <Ring pct={progress} tone={done ? "#94A3B8" : brand.bg} />
          <div className="flex-1 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Earned</div>
              <div className="mt-0.5 tabular font-display font-700 text-[#10B981]">
                {formatNaira(inv.total_earned)}
              </div>
              <div className="text-[10px] text-[#94A3B8] tabular">ROI {roiPct.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Remaining</div>
              <div className="mt-0.5 tabular font-display font-700 text-white">
                {formatNaira(remaining)}
              </div>
              <div className="text-[10px] text-[#94A3B8] tabular">
                {Math.max(0, inv.duration_days - inv.drops_done)} days left
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
            <Timer className="w-3 h-3" />
            Next payout <span className="text-white tabular ml-1">{nextPayoutText(inv)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#94A3B8]">
            <Calendar className="w-3 h-3" />
            <span className="tabular">{inv.drops_done} / {inv.duration_days}</span>
          </span>
        </div>

        <div className="mt-3 h-1.5 rounded-full bg-[#1A2B44] overflow-hidden">
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

  const load = () => {
    setLoading(true);
    api.get("/investments").then((r) => setInvs(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

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
      {/* Hero */}
      <div className="relative rounded-2xl p-5 overflow-hidden border border-[#1A2B44]"
           style={{ background: "linear-gradient(135deg,#0B1524 0%, #0A2A6C 100%)" }}>
        <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full bg-[#0055FF]/25 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Portfolio value</div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="font-display font-800 text-3xl tabular text-white" data-testid="inv-total-active">
              {formatNaira(totalActive)}
            </div>
            <span className="text-[11px] text-[#94A3B8]">
              across {active.length} active plan{active.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="uppercase tracking-widest text-[#94A3B8]">Earned so far</div>
              <div className="mt-1 tabular font-display font-700 text-[#10B981]" data-testid="inv-total-earned">
                {formatNaira(totalEarned)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="uppercase tracking-widest text-[#94A3B8]">Projected remaining</div>
              <div className="mt-1 tabular font-display font-700 text-white" data-testid="inv-projected-remaining">
                {formatNaira(projectedRemaining)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-800 tracking-tight" data-testid="investments-heading">
          My investments
        </h1>
        <Link to="/marketplace" className="text-xs text-[#0055FF] hover:underline flex items-center gap-1">
          Browse plans <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-[#0B1524] border border-[#1A2B44]">
        {[
          { k: "active",    label: `Active (${active.length})`,       tid: "tab-active" },
          { k: "completed", label: `Completed (${completed.length})`, tid: "tab-completed" },
          { k: "all",       label: `All (${invs.length})`,            tid: "tab-all" },
        ].map(({ k, label, tid }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={tid}
            className={`h-9 text-xs rounded-lg font-medium transition-colors ${
              tab === k ? "bg-[#0055FF] text-white" : "text-[#94A3B8] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-[#1A2B44] p-8 text-center text-sm text-[#94A3B8]" data-testid="inv-loading">
          Loading investments…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1A2B44] p-8 text-center space-y-3" data-testid="inv-empty">
          <Sparkles className="w-6 h-6 text-[#0055FF] mx-auto" />
          <div className="text-sm text-[#94A3B8]">
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
