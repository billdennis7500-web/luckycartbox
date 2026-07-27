import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function AdminUserDetail() {
  const { uid } = useParams();
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/admin/users/${uid}`).then((r) => setData(r.data)); }, [uid]);

  if (!data) return <div className="text-[#94A3B8]">Loading…</div>;
  const { user, transactions, investments } = data;

  const stat = (l, v) => (
    <div className="rounded-lg border border-[#1A2B44] bg-[#0B1524] p-4">
      <div className="text-xs text-[#94A3B8] uppercase tracking-widest">{l}</div>
      <div className="mt-2 font-display font-800 text-lg tabular">{v}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="text-sm text-[#0055FF] flex items-center gap-1 hover:underline"><ArrowLeft className="w-4 h-4"/>Back to users</Link>

      <div>
        <h1 className="font-display text-3xl font-800" data-testid="user-detail-heading">{user.name}</h1>
        <p className="text-[#94A3B8] mt-1">{user.phone} · code <code className="text-[#0055FF]">{user.referral_code}</code></p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat("Wallet", formatNaira(user.wallet_balance))}
        {stat("Bonus", formatNaira(user.bonus_balance))}
        {stat("Total invested", formatNaira(user.total_invested))}
        {stat("Total earned", formatNaira(user.total_earned))}
      </div>

      <section>
        <h2 className="font-display text-lg font-600 mb-3">Investments</h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
              <tr><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Daily</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Earned</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-[#1A2B44]">
              {investments.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-[#94A3B8]">No investments.</td></tr>}
              {investments.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3">{i.product_name}</td>
                  <td className="px-4 py-3 tabular">{formatNaira(i.price)}</td>
                  <td className="px-4 py-3 tabular">{i.daily_profit_pct}%</td>
                  <td className="px-4 py-3 tabular">{i.drops_done} / {i.duration_days}</td>
                  <td className="px-4 py-3 tabular text-[#10B981]">{formatNaira(i.total_earned)}</td>
                  <td className="px-4 py-3 capitalize">{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="font-display text-lg font-600 mb-3">Recent transactions</h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Note</th><th className="px-4 py-3 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-[#1A2B44]">
              {transactions.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-[#94A3B8]">No transactions.</td></tr>}
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-[#94A3B8]">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize">{t.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{t.note}</td>
                  <td className={`px-4 py-3 text-right tabular font-display font-600 ${t.amount >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                    {t.amount >= 0 ? "+" : ""}{formatNaira(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
