import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, CheckCircle2, Sparkles } from "lucide-react";

export default function Investments() {
  const [invs, setInvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active"); // active | completed | all

  const load = () => {
    setLoading(true);
    api.get("/investments")
      .then((r) => setInvs(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const active = invs.filter((i) => i.status === "active");
  const completed = invs.filter((i) => i.status === "completed");
  const shown = tab === "active" ? active : tab === "completed" ? completed : invs;

  const totalActive = active.reduce((s, i) => s + (i.price || 0), 0);
  const totalEarned = invs.reduce((s, i) => s + (i.total_earned || 0), 0);

  return (
    <div className="space-y-6" data-testid="investments-page">
      <div>
        <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="investments-heading">
          My investments
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Every plan you've picked, plus daily earnings across all of them.
        </p>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-4">
          <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Active capital</div>
          <div className="mt-1 font-display font-800 text-xl tabular" data-testid="inv-total-active">
            {formatNaira(totalActive)}
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-1">{active.length} running plan{active.length === 1 ? "" : "s"}</div>
        </Card>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-4">
          <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Total earned</div>
          <div className="mt-1 font-display font-800 text-xl tabular text-[#10B981]" data-testid="inv-total-earned">
            {formatNaira(totalEarned)}
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-1">from all plans, live-updating</div>
        </Card>
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
              tab === k
                ? "bg-[#0055FF] text-white"
                : "text-[#94A3B8] hover:text-white"
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
            {tab === "active" ? "No active investments yet." :
             tab === "completed" ? "No completed investments yet." :
             "You haven't started any investment plan."}
          </div>
          <Link to="/marketplace">
            <Button className="h-10 bg-[#0055FF] hover:bg-[#3377FF]" data-testid="inv-empty-cta">
              <TrendingUp className="w-4 h-4 mr-1.5" /> Browse plans
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((i) => {
            const progress = Math.min(100, Math.round((i.drops_done / i.duration_days) * 100));
            const done = i.status === "completed";
            return (
              <Card
                key={i.id}
                className="bg-[#0B1524] border-[#1A2B44] p-4 rounded-2xl"
                data-testid={`inv-row-${i.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display font-600 truncate">{i.product_name}</div>
                    <div className="text-xs text-[#94A3B8] tabular mt-0.5">
                      {formatNaira(i.price)} · {i.daily_profit_pct}% / day
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                    done
                      ? "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/30"
                      : "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                  }`}>
                    {done ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Completed</span> : "Active"}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>Earned <span className="text-[#10B981] tabular">{formatNaira(i.total_earned)}</span></span>
                  <span className="tabular">{i.drops_done} / {i.duration_days} days</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[#1A2B44] overflow-hidden">
                  <div className={`h-full ${done ? "bg-[#94A3B8]" : "bg-[#0055FF]"}`} style={{ width: `${progress}%` }} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
