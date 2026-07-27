import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, Gift, Users, Sparkles, ArrowUpRight } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend,
} from "recharts";

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [invs, setInvs] = useState([]);
  const [tx, setTx] = useState([]);
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState(30);

  useEffect(() => {
    refresh();
    api.get("/investments").then((r) => setInvs(r.data));
    api.get("/transactions").then((r) => setTx(r.data.slice(0, 5)));
  }, []); // eslint-disable-line

  useEffect(() => {
    api.get("/wallet-history", { params: { days: range } }).then((r) => setHistory(r.data));
  }, [range, user?.wallet_balance]);

  const active = invs.filter((i) => i.status === "active");
  const totalEarned = user?.total_earned || 0;
  const totalInvested = user?.total_invested || 0;

  const stats = [
    { label: "Wallet", value: formatNaira(user?.wallet_balance), icon: Wallet, testid: "stat-wallet" },
    { label: "Bonus", value: formatNaira(user?.bonus_balance), icon: Gift, testid: "stat-bonus" },
    { label: "Total invested", value: formatNaira(totalInvested), icon: TrendingUp, testid: "stat-invested" },
    { label: "Total earned", value: formatNaira(totalEarned), icon: Sparkles, testid: "stat-earned" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="dashboard-heading">
            Welcome back, {user?.name?.split(" ")[0]}.
          </h1>
          <p className="text-[#94A3B8] mt-2">Here's how your naira is doing today.</p>
        </div>
        <Link to="/marketplace" data-testid="dashboard-invest-link">
          <Button className="bg-[#0055FF] hover:bg-[#3377FF] rounded-md glow-primary h-11">
            Invest now <ArrowUpRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>

      {!user?.has_invested && (
        <div className="rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-5 flex flex-wrap items-center justify-between gap-4" data-testid="not-invested-banner">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#0055FF] mt-0.5" />
            <div>
              <div className="font-display font-600">You have a ₦{Math.round(user?.bonus_balance || 0)} welcome bonus waiting.</div>
              <div className="text-sm text-[#94A3B8] mt-1">
                Deposit funds and pick a plan to activate withdrawals, referral commissions, and coupon redemptions.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/deposit"><Button variant="outline" className="border-[#1A2B44] bg-transparent hover:bg-[#121E30] text-white">Deposit</Button></Link>
            <Link to="/marketplace"><Button className="bg-[#0055FF] hover:bg-[#3377FF]">See plans</Button></Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="bg-[#0B1524] border border-[#1A2B44] p-5 rounded-xl card-hover" data-testid={s.testid}>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-[#94A3B8]">{s.label}</div>
              <s.icon className="w-4 h-4 text-[#0055FF]" />
            </div>
            <div className="mt-3 font-display font-800 text-2xl tabular">{s.value}</div>
          </Card>
        ))}
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-xl font-600">Wallet history</h2>
            <p className="text-xs text-[#94A3B8] mt-1">Running balance & daily flow.</p>
          </div>
          <div className="inline-flex rounded-md border border-[#1A2B44] bg-[#0B1524] p-1" data-testid="range-toggle">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setRange(d)}
                data-testid={`range-${d}`}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  range === d ? "bg-[#0055FF] text-white" : "text-[#94A3B8] hover:text-white"
                }`}
              >
                {d}D
              </button>
            ))}
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl p-4 lg:col-span-2" data-testid="wallet-chart-card">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history?.series || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-bal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0055FF" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#0055FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1A2B44" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#94A3B8"
                    fontSize={11}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
                    tick={{ fill: "#94A3B8" }}
                  />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={11}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    tick={{ fill: "#94A3B8" }}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0B1524", border: "1px solid #1A2B44", borderRadius: 8, color: "#F8FAFC" }}
                    labelFormatter={(d) => new Date(d).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" })}
                    formatter={(v) => [formatNaira(v), "Balance"]}
                  />
                  <Area type="monotone" dataKey="balance" stroke="#0055FF" strokeWidth={2.5} fill="url(#g-bal)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl p-4" data-testid="flow-chart-card">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history?.series || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1A2B44" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#94A3B8"
                    fontSize={11}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
                    tick={{ fill: "#94A3B8" }}
                  />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={11}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    tick={{ fill: "#94A3B8" }}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0B1524", border: "1px solid #1A2B44", borderRadius: 8, color: "#F8FAFC" }}
                    labelFormatter={(d) => new Date(d).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" })}
                    formatter={(v, key) => [formatNaira(v), key === "credit" ? "In" : "Out"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#94A3B8" }} />
                  <Bar dataKey="credit" fill="#10B981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="debit" fill="#EF4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-600">Active investments</h2>
          <Link to="/marketplace" className="text-sm text-[#0055FF] hover:underline">Browse plans</Link>
        </div>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#1A2B44] p-10 text-center text-[#94A3B8]" data-testid="no-active-investments">
            No active investments yet. Pick a plan to start earning daily.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map((i) => {
              const progress = Math.min(100, Math.round((i.drops_done / i.duration_days) * 100));
              return (
                <Card key={i.id} className="bg-[#0B1524] border border-[#1A2B44] p-5 rounded-xl card-hover" data-testid={`active-inv-${i.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-display font-600">{i.product_name}</div>
                    <div className="text-xs px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">Active</div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-[#94A3B8]">Invested</div>
                      <div className="tabular font-display font-600">{formatNaira(i.price)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#94A3B8]">Daily</div>
                      <div className="tabular font-display font-600">{i.daily_profit_pct}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#94A3B8]">Earned</div>
                      <div className="tabular text-[#10B981]">{formatNaira(i.total_earned)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#94A3B8]">Days</div>
                      <div className="tabular">{i.drops_done} / {i.duration_days}</div>
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 rounded-full bg-[#1A2B44] overflow-hidden">
                    <div className="h-full bg-[#0055FF]" style={{ width: `${progress}%` }} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-600">Recent activity</h2>
          <Link to="/transactions" className="text-sm text-[#0055FF] hover:underline">See all</Link>
        </div>
        <Card className="bg-[#0B1524] border border-[#1A2B44] rounded-xl divide-y divide-[#1A2B44] overflow-hidden">
          {tx.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#94A3B8]" data-testid="no-recent-tx">No transactions yet.</div>
          ) : tx.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <div className="capitalize">{t.type.replace(/_/g, " ")}</div>
                <div className="text-xs text-[#94A3B8]">{t.note}</div>
              </div>
              <div className={`tabular font-display font-600 ${t.amount >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                {t.amount >= 0 ? "+" : ""}{formatNaira(t.amount)}
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
