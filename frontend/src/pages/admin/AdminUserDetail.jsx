import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, Wallet, Plus, Minus, RefreshCw, TrendingUp, Landmark, Copy,
  Gift, Sparkles,
} from "lucide-react";

function StatChip({ label, value, tone = "default" }) {
  const map = {
    default:  "text-white",
    green:    "text-[#10B981]",
    blue:     "text-[#0055FF]",
    amber:    "text-[#F59E0B]",
  };
  return (
    <div className="rounded-xl border border-[#1A2B44] bg-[#0B1524] p-4">
      <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">{label}</div>
      <div className={`mt-1 font-display font-800 text-xl tabular ${map[tone] || map.default}`}>{value}</div>
    </div>
  );
}

function copyText(v) {
  if (!v) return;
  navigator.clipboard.writeText(String(v));
  toast.success("Copied");
}

export default function AdminUserDetail() {
  const { uid } = useParams();
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [op, setOp] = useState("credit"); // credit | debit
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/admin/users/${uid}`).then((r) => setData(r.data));
  useEffect(() => { load(); }, [uid]); // eslint-disable-line

  const submit = async () => {
    const raw = Number(amount);
    if (!raw || raw <= 0) return toast.error("Enter a positive amount");
    const signed = op === "credit" ? raw : -raw;
    setSaving(true);
    try {
      await api.post(`/admin/users/${uid}/add-balance`, {
        amount: signed,
        note: note || (op === "credit" ? "Admin credit" : "Admin debit"),
      });
      toast.success(`${op === "credit" ? "Credited" : "Debited"} ₦${raw.toLocaleString()}`);
      setAmount(""); setNote("");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  const activeInv = useMemo(() => (data?.investments || []).filter((i) => i.status === "active"), [data]);
  const completedInv = useMemo(() => (data?.investments || []).filter((i) => i.status === "completed"), [data]);

  if (!data) return <div className="text-[#94A3B8]">Loading…</div>;
  const { user, transactions, investments } = data;
  const bank = user.bank_account;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/admin/users" className="text-sm text-[#0055FF] flex items-center gap-1 hover:underline">
          <ArrowLeft className="w-4 h-4"/>Back to users
        </Link>
        <Button variant="outline" size="sm" onClick={load} data-testid="user-detail-refresh"
                className="border-[#1A2B44] bg-transparent text-white">
          <RefreshCw className="w-3 h-3 mr-1"/>Refresh
        </Button>
      </div>

      {/* Header card */}
      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full bg-[#0055FF]/25 blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Viewing dashboard as</div>
            <h1 className="font-display text-2xl lg:text-3xl font-800 mt-1" data-testid="user-detail-heading">{user.name}</h1>
            <div className="text-sm text-[#94A3B8] mt-1 tabular">{user.phone}</div>
            <div className="text-xs mt-2 flex items-center gap-2">
              <span className="text-[#94A3B8]">Referral code:</span>
              <code className="text-[#0055FF]">{user.referral_code}</code>
              <button onClick={() => copyText(user.referral_code)} className="text-[#94A3B8] hover:text-white" aria-label="Copy code">
                <Copy className="w-3 h-3" />
              </button>
              {user.referred_by && <span className="text-[#94A3B8]">· invited by {user.referred_by}</span>}
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full border ${
            user.has_invested
              ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
              : "bg-[#1A2B44] text-[#94A3B8] border-[#1A2B44]"
          }`}>
            {user.has_invested ? "Investor" : "Signed up"}
          </span>
        </div>
      </Card>

      {/* Balance ops */}
      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Wallet balance</div>
            <div className="mt-1 font-display font-800 text-3xl tabular text-white" data-testid="user-wallet-balance">
              {formatNaira(user.wallet_balance)}
            </div>
            <div className="text-xs text-[#94A3B8] mt-1">
              Bonus: <span className="text-white tabular">{formatNaira(user.bonus_balance)}</span>
            </div>
          </div>

          <div className="w-full sm:w-auto sm:min-w-[360px] space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOp("credit")}
                data-testid="op-credit-btn"
                className={`h-9 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1 ${
                  op === "credit"
                    ? "bg-[#10B981] text-white border-[#10B981]"
                    : "bg-transparent border-[#1A2B44] text-[#94A3B8] hover:text-white"
                }`}
              >
                <Plus className="w-3 h-3" /> Credit
              </button>
              <button
                onClick={() => setOp("debit")}
                data-testid="op-debit-btn"
                className={`h-9 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-1 ${
                  op === "debit"
                    ? "bg-[#EF4444] text-white border-[#EF4444]"
                    : "bg-transparent border-[#1A2B44] text-[#94A3B8] hover:text-white"
                }`}
              >
                <Minus className="w-3 h-3" /> Debit
              </button>
            </div>
            <div>
              <Label>Amount (₦)</Label>
              <Input
                type="number" min="1" step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="user-balance-amount-input"
                className="mt-1 bg-[#121E30] border-[#1A2B44] text-white h-10 tabular"
              />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={op === "credit" ? "Reason for crediting" : "Reason for debiting"}
                data-testid="user-balance-note-input"
                className="mt-1 bg-[#121E30] border-[#1A2B44] text-white h-10"
              />
            </div>
            <Button
              onClick={submit}
              disabled={saving || !amount}
              data-testid="user-balance-submit"
              className={`w-full h-10 rounded-lg ${
                op === "credit" ? "bg-[#10B981] hover:bg-[#0ea770]" : "bg-[#EF4444] hover:bg-[#dc2626]"
              }`}
            >
              <Wallet className="w-3.5 h-3.5 mr-1.5" />
              {saving ? "Saving…" : op === "credit"
                ? `Credit ₦${amount ? Number(amount).toLocaleString() : "0"}`
                : `Debit ₦${amount ? Number(amount).toLocaleString() : "0"}`}
            </Button>
          </div>
        </div>
      </Card>

      {/* Stat grid (mirrors user's dashboard) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatChip label="Total invested"  value={formatNaira(user.total_invested)} />
        <StatChip label="Total earned"    value={formatNaira(user.total_earned)} tone="green" />
        <StatChip label="Active plans"    value={activeInv.length} tone="blue" />
        <StatChip label="Completed plans" value={completedInv.length} />
      </div>

      {/* Bound bank */}
      <section>
        <h2 className="font-display text-lg font-600 mb-3 flex items-center gap-2">
          <Landmark className="w-4 h-4 text-[#0055FF]" /> Bound bank account
        </h2>
        {bank && bank.bank_name ? (
          <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-4 flex items-center gap-3" data-testid="user-bank-card">
            <div className="w-11 h-11 rounded-lg bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
              <Landmark className="w-5 h-5 text-[#0055FF]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-600 truncate">{bank.bank_name}</div>
              <div className="text-xs text-[#94A3B8] tabular truncate">
                {bank.account_number} · {bank.account_name}
              </div>
            </div>
            <button onClick={() => copyText(bank.account_number)} className="text-[#94A3B8] hover:text-white" aria-label="Copy account number">
              <Copy className="w-4 h-4" />
            </button>
          </Card>
        ) : (
          <div className="rounded-xl border border-dashed border-[#1A2B44] p-4 text-sm text-[#94A3B8]" data-testid="user-bank-empty">
            No bank account bound yet.
          </div>
        )}
      </section>

      {/* Investments */}
      <section>
        <h2 className="font-display text-lg font-600 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#0055FF]" /> Investments
        </h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
              <tr>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Daily</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Earned</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2B44]">
              {investments.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-[#94A3B8]" data-testid="user-inv-empty">
                  <Sparkles className="w-5 h-5 text-[#0055FF] mx-auto mb-1"/>
                  No investments.
                </td></tr>
              )}
              {investments.map((i) => (
                <tr key={i.id} data-testid={`user-inv-row-${i.id}`}>
                  <td className="px-4 py-3">{i.product_name}</td>
                  <td className="px-4 py-3 tabular">{formatNaira(i.price)}</td>
                  <td className="px-4 py-3 tabular">{i.daily_profit_pct}%</td>
                  <td className="px-4 py-3 tabular">{i.drops_done} / {i.duration_days}</td>
                  <td className="px-4 py-3 tabular text-[#10B981]">{formatNaira(i.total_earned)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${
                      i.status === "active"
                        ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                        : "bg-[#94A3B8]/15 text-[#94A3B8] border-[#94A3B8]/30"
                    }`}>{i.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Transactions */}
      <section>
        <h2 className="font-display text-lg font-600 mb-3 flex items-center gap-2">
          <Gift className="w-4 h-4 text-[#0055FF]" /> Recent transactions
        </h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2B44]">
              {transactions.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-[#94A3B8]">No transactions.</td></tr>
              )}
              {transactions.map((t) => (
                <tr key={t.id} data-testid={`user-tx-row-${t.id}`}>
                  <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize">{t.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{t.note}</td>
                  <td className={`px-4 py-3 text-right tabular font-display font-600 ${
                    t.amount >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                  }`}>
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
