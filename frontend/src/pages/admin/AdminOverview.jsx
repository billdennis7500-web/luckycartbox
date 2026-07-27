import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Wallet, Coins, Clock, PackageOpen, Zap,
} from "lucide-react";

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [pn, setPn] = useState(null);
  const [pnBalance, setPnBalance] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then((r) => setStats(r.data));
    api.get("/admin/paynow/status").then((r) => {
      setPn(r.data);
      if (r.data?.enabled) api.get("/admin/paynow/balance").then((rb) => setPnBalance(rb.data?.data));
    }).catch(() => {});
  }, []);

  const cards = stats ? [
    { label: "Total users", value: stats.total_users, icon: Users, testid: "stat-total-users" },
    { label: "Invested users", value: stats.invested_users, icon: TrendingUp, testid: "stat-invested-users" },
    { label: "Pending deposits", value: stats.pending_deposits, icon: Clock, testid: "stat-pending-deposits", accent: "text-[#F59E0B]" },
    { label: "Pending withdrawals", value: stats.pending_withdrawals, icon: Clock, testid: "stat-pending-withdrawals", accent: "text-[#F59E0B]" },
    { label: "Total deposited", value: formatNaira(stats.total_deposited), icon: ArrowDownToLine, testid: "stat-total-deposited" },
    { label: "Total withdrawn", value: formatNaira(stats.total_withdrawn), icon: ArrowUpFromLine, testid: "stat-total-withdrawn" },
    { label: "Total invested (₦)", value: formatNaira(stats.total_invested), icon: Wallet, testid: "stat-total-invested" },
    { label: "Profit paid out", value: formatNaira(stats.total_profit_paid), icon: Coins, testid: "stat-profit-paid" },
  ] : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-overview-heading">Overview</h1>
        <p className="text-[#94A3B8] mt-2">All the numbers behind your platform.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="bg-[#0B1524] border border-[#1A2B44] p-5 rounded-xl card-hover" data-testid={c.testid}>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-[#94A3B8]">{c.label}</div>
              <c.icon className={`w-4 h-4 ${c.accent || "text-[#0055FF]"}`} />
            </div>
            <div className="mt-3 font-display font-800 text-2xl tabular">{c.value}</div>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="font-display text-xl font-600 mb-3">Payment gateway</h2>
        <Card className="bg-[#0B1524] border border-[#1A2B44] rounded-xl p-5" data-testid="paynow-card">
          {pn?.enabled ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
                  <Zap className="w-5 h-5 text-[#0055FF]" />
                </div>
                <div>
                  <div className="font-display font-600 flex items-center gap-2">
                    PayNow · Merchant {pn.merchant_no}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">Live</span>
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1">
                    Payins: {pn.payin_channel} · Payouts: {pn.payout_channel} · Currency: {pn.currency}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Gateway balance</div>
                <div className="font-display font-800 text-xl tabular" data-testid="paynow-balance">
                  {pnBalance ? formatNaira(Number(pnBalance.amount || 0)) : "—"}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#94A3B8]">PayNow gateway is not configured. Set PAYNOW_* environment variables to enable auto deposits and payouts.</div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="font-display text-xl font-600 mb-3">Quick actions</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { to: "/admin/deposits?status=pending", label: "Review deposits", icon: ArrowDownToLine, testid: "quick-review-deposits" },
            { to: "/admin/withdrawals?status=pending", label: "Review withdrawals", icon: ArrowUpFromLine, testid: "quick-review-withdrawals" },
            { to: "/admin/users", label: "Add balance to user", icon: Wallet, testid: "quick-add-balance" },
            { to: "/admin/products", label: "Manage products", icon: PackageOpen, testid: "quick-manage-products" },
          ].map((q) => (
            <Link key={q.to} to={q.to} data-testid={q.testid}>
              <Card className="bg-[#0B1524] border border-[#1A2B44] p-5 rounded-xl card-hover flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
                  <q.icon className="w-5 h-5 text-[#0055FF]" />
                </div>
                <div className="font-display font-600">{q.label}</div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
