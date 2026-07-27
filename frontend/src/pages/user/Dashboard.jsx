import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowDownToLine, ArrowUpFromLine, Ticket, Sparkles, Gift, TrendingUp, Wallet,
  Eye, EyeOff, Copy,
} from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [invs, setInvs] = useState([]);
  const [tx, setTx] = useState([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    refresh();
    api.get("/investments").then((r) => setInvs(r.data));
    api.get("/transactions").then((r) => setTx(r.data.slice(0, 5)));
  }, []); // eslint-disable-line

  const active = invs.filter((i) => i.status === "active");

  const copyCode = () => {
    if (!user?.referral_code) return;
    navigator.clipboard.writeText(user.referral_code);
    toast.success("Referral code copied");
  };

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Welcome</div>
        <h1 className="font-display text-2xl font-800 tracking-tight mt-1" data-testid="dashboard-heading">
          Hi, {user?.name?.split(" ")[0] || "there"} 👋
        </h1>
      </div>

      {/* Wallet balance flat card */}
      <Card
        data-testid="wallet-card"
        className="rounded-2xl border border-[#1A2B44] bg-gradient-to-br from-[#0055FF] via-[#003ec7] to-[#0B1524] p-6 text-white shadow-[0_20px_60px_-25px_rgba(0,85,255,0.6)]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/70">
            <Wallet className="w-3.5 h-3.5" /> Wallet balance
          </div>
          <button
            onClick={() => setHidden((v) => !v)}
            data-testid="wallet-hide-toggle"
            className="text-white/70 hover:text-white transition-colors"
          >
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="mt-3 font-display font-800 text-4xl sm:text-5xl tabular" data-testid="wallet-amount">
          {hidden ? "₦ • • • • •" : formatNaira(user?.wallet_balance)}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-white/60 uppercase tracking-wider">Bonus</div>
            <div className="mt-1 font-display font-600 tabular">{formatNaira(user?.bonus_balance)}</div>
          </div>
          <div>
            <div className="text-white/60 uppercase tracking-wider">Invested</div>
            <div className="mt-1 font-display font-600 tabular">{formatNaira(user?.total_invested)}</div>
          </div>
          <div>
            <div className="text-white/60 uppercase tracking-wider">Earned</div>
            <div className="mt-1 font-display font-600 tabular">{formatNaira(user?.total_earned)}</div>
          </div>
        </div>
      </Card>

      {/* Primary actions: Deposit + Withdraw side by side */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/deposit" data-testid="quick-deposit-link" className="block">
          <div className="rounded-xl border border-[#1A2B44] bg-[#0B1524] p-5 card-hover flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#10B981]/15 border border-[#10B981]/30 grid place-items-center">
              <ArrowDownToLine className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <div className="font-display font-600">Deposit</div>
              <div className="text-xs text-[#94A3B8] mt-0.5">Fund your wallet</div>
            </div>
          </div>
        </Link>
        <Link to="/withdraw" data-testid="quick-withdraw-link" className="block">
          <div className="rounded-xl border border-[#1A2B44] bg-[#0B1524] p-5 card-hover flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
              <ArrowUpFromLine className="w-5 h-5 text-[#0055FF]" />
            </div>
            <div>
              <div className="font-display font-600">Withdraw</div>
              <div className="text-xs text-[#94A3B8] mt-0.5">Cash out to bank</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Secondary actions: Redeem + Invest */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/coupon" data-testid="quick-redeem-link" className="block">
          <div className="rounded-xl border border-[#1A2B44] bg-[#0B1524] p-5 card-hover flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 grid place-items-center">
              <Ticket className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <div className="font-display font-600">Redeem</div>
              <div className="text-xs text-[#94A3B8] mt-0.5">Use a bonus code</div>
            </div>
          </div>
        </Link>
        <Link to="/marketplace" data-testid="quick-invest-link" className="block">
          <div className="rounded-xl border border-[#1A2B44] bg-[#0B1524] p-5 card-hover flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
              <TrendingUp className="w-5 h-5 text-[#0055FF]" />
            </div>
            <div>
              <div className="font-display font-600">Invest</div>
              <div className="text-xs text-[#94A3B8] mt-0.5">Pick a plan</div>
            </div>
          </div>
        </Link>
      </div>

      {/* Not-invested banner */}
      {!user?.has_invested && (
        <div
          data-testid="not-invested-banner"
          className="rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-4 flex items-start gap-3"
        >
          <Sparkles className="w-5 h-5 text-[#0055FF] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-display font-600 text-sm">
              You have {formatNaira(user?.bonus_balance)} welcome bonus.
            </div>
            <div className="text-xs text-[#94A3B8] mt-1">
              Invest to unlock withdrawals, referral commissions and coupon redemptions.
            </div>
          </div>
        </div>
      )}

      {/* Referral code hint */}
      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Your referral code</div>
            <div className="mt-1 font-display font-800 text-xl tabular" data-testid="dashboard-ref-code">
              {user?.referral_code}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={copyCode}
              data-testid="dashboard-copy-ref"
              className="border-[#1A2B44] bg-transparent text-white"
            >
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
            <Link to="/referrals" data-testid="dashboard-referrals-link">
              <Button size="sm" className="bg-[#0055FF] hover:bg-[#3377FF]">
                <Gift className="w-3 h-3 mr-1" /> Invite
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Active investments */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-600">Active investments</h2>
          <Link to="/marketplace" className="text-xs text-[#0055FF] hover:underline">Browse plans</Link>
        </div>
        {active.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-[#1A2B44] p-8 text-center text-sm text-[#94A3B8]"
            data-testid="no-active-investments"
          >
            No active investments. Pick a plan to start earning.
          </div>
        ) : (
          <div className="grid gap-3">
            {active.map((i) => {
              const progress = Math.min(100, Math.round((i.drops_done / i.duration_days) * 100));
              return (
                <Card
                  key={i.id}
                  className="bg-[#0B1524] border-[#1A2B44] p-4 rounded-xl"
                  data-testid={`active-inv-${i.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-display font-600">{i.product_name}</div>
                    <div className="text-xs px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                      {i.daily_profit_pct}% / day
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[#94A3B8]">
                    <span>Earned <span className="text-[#10B981] tabular">{formatNaira(i.total_earned)}</span></span>
                    <span className="tabular">{i.drops_done} / {i.duration_days} days</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-[#1A2B44] overflow-hidden">
                    <div className="h-full bg-[#0055FF]" style={{ width: `${progress}%` }} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-600">Recent activity</h2>
          <Link to="/profile" className="text-xs text-[#0055FF] hover:underline">See all</Link>
        </div>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl divide-y divide-[#1A2B44] overflow-hidden">
          {tx.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#94A3B8]" data-testid="no-recent-tx">
              No transactions yet.
            </div>
          ) : (
            tx.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="capitalize truncate">{t.type.replace(/_/g, " ")}</div>
                  <div className="text-xs text-[#94A3B8] truncate">{t.note}</div>
                </div>
                <div
                  className={`tabular font-display font-600 shrink-0 ${
                    t.amount >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                  }`}
                >
                  {t.amount >= 0 ? "+" : ""}
                  {formatNaira(t.amount)}
                </div>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
