import React, { useEffect, useMemo, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/pages/user/Deposit";
import { Lock, Zap } from "lucide-react";

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ amount: "", bank_name: "", account_number: "", account_name: "", bank_code: "" });
  const [history, setHistory] = useState([]);
  const [banks, setBanks] = useState([]);
  const [paynowEnabled, setPaynowEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState("");

  const load = () => {
    api.get("/withdrawals").then((r) => setHistory(r.data));
    api.get("/paynow/banks").then((r) => {
      setPaynowEnabled(!!r.data?.enabled);
      setBanks(r.data?.data || []);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const filteredBanks = useMemo(() => {
    if (!bankQuery) return banks.slice(0, 40);
    const q = bankQuery.toLowerCase();
    return banks.filter((b) => (b.bankName || "").toLowerCase().includes(q)).slice(0, 40);
  }, [banks, bankQuery]);

  const canWithdraw = user?.has_invested;

  const submit = async (e) => {
    e.preventDefault();
    if (!canWithdraw) return;
    setLoading(true);
    try {
      await api.post("/withdrawals", { ...form, amount: Number(form.amount) });
      toast.success(paynowEnabled && form.bank_code
        ? "Withdrawal requested. Payout will be sent automatically after admin approval."
        : "Withdrawal requested. Awaiting admin approval.");
      setForm({ amount: "", bank_name: "", account_number: "", account_name: "", bank_code: "" });
      await refresh(); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pickBank = (code) => {
    const b = banks.find((x) => x.bankCode === code);
    setForm({ ...form, bank_code: code, bank_name: b?.bankName || form.bank_name });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="withdraw-heading">Withdraw</h1>
        <p className="text-[#94A3B8] mt-2">Cash out to your Nigerian bank account.</p>
      </div>

      {!canWithdraw && (
        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-5 flex items-start gap-3" data-testid="withdraw-locked-banner">
          <Lock className="w-5 h-5 text-[#F59E0B] mt-0.5" />
          <div>
            <div className="font-display font-600">Withdrawals unlock after your first investment.</div>
            <div className="text-sm text-[#94A3B8] mt-1">Pick a plan from the marketplace to unlock this feature.</div>
          </div>
        </div>
      )}

      {paynowEnabled && canWithdraw && (
        <div className="rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-5 flex items-start gap-3">
          <Zap className="w-5 h-5 text-[#0055FF] mt-0.5" />
          <div className="text-sm">
            <div className="font-display font-600">Instant bank payout</div>
            <div className="text-[#94A3B8] mt-1">Select your bank from the searchable list — approval sends the funds directly via PayNow.</div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl">
          <h2 className="font-display text-lg font-600 mb-4">Request withdrawal</h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Amount (₦)</Label>
              <Input type="number" min="1" value={form.amount} onChange={set("amount")} required disabled={!canWithdraw}
                     data-testid="withdraw-amount-input"
                     className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
              <p className="text-xs text-[#94A3B8] mt-1">Available: {formatNaira(user?.wallet_balance)}</p>
            </div>

            {paynowEnabled && banks.length > 0 ? (
              <div>
                <Label>Bank</Label>
                <Input
                  placeholder="Search bank name…"
                  value={bankQuery}
                  onChange={(e) => setBankQuery(e.target.value)}
                  data-testid="withdraw-bank-search"
                  className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-10"
                />
                <Select value={form.bank_code} onValueChange={pickBank}>
                  <SelectTrigger data-testid="withdraw-bank-select" className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0B1524] border-[#1A2B44] text-white max-h-64">
                    {filteredBanks.map((b) => (
                      <SelectItem key={b.bankCode} value={b.bankCode}>{b.bankName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Bank name</Label>
                <Input value={form.bank_name} onChange={set("bank_name")} required disabled={!canWithdraw}
                       data-testid="withdraw-bank-input"
                       className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
              </div>
            )}

            <div>
              <Label>Account number</Label>
              <Input value={form.account_number} onChange={set("account_number")} required disabled={!canWithdraw}
                     data-testid="withdraw-accountnum-input"
                     className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11 tabular" />
            </div>
            <div>
              <Label>Account name</Label>
              <Input value={form.account_name} onChange={set("account_name")} required disabled={!canWithdraw}
                     data-testid="withdraw-accountname-input"
                     className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
            </div>
            <Button type="submit" disabled={loading || !canWithdraw}
                    data-testid="withdraw-submit-button"
                    className="w-full h-11 bg-[#0055FF] hover:bg-[#3377FF] rounded-md glow-primary">
              {loading ? "Submitting…" : "Request withdrawal"}
            </Button>
          </form>
        </Card>

        <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl">
          <h2 className="font-display text-lg font-600 mb-4">Notes</h2>
          <ul className="text-sm text-[#94A3B8] space-y-3 list-disc pl-5">
            <li>Requested amount is held from your wallet immediately.</li>
            <li>Rejected or reversed payouts are automatically refunded.</li>
            <li>PayNow payouts typically settle within minutes after admin approval.</li>
            <li>Manual withdrawals (no bank code) are handled by the admin.</li>
          </ul>
        </Card>
      </div>

      <section>
        <h2 className="font-display text-xl font-600 mb-3">Withdrawal history</h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Bank</th><th className="px-4 py-3 text-right">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-[#1A2B44]">
              {history.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-[#94A3B8]" data-testid="no-withdrawals">No withdrawals yet.</td></tr>}
              {history.map((w) => (
                <tr key={w.id} data-testid={`withdraw-row-${w.id}`}>
                  <td className="px-4 py-3 text-[#94A3B8]">{new Date(w.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 tabular font-display font-600">{formatNaira(w.amount)}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">{w.bank_name} · {w.account_number}</td>
                  <td className="px-4 py-3 text-right"><StatusPill status={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
