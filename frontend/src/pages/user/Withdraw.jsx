import React, { useEffect, useMemo, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/pages/user/Deposit";
import { Lock, Zap, Search, Check } from "lucide-react";
import LoadMore from "@/components/LoadMore";

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ amount: "", bank_name: "", account_number: "", account_name: "", bank_code: "" });
  const [history, setHistory] = useState([]);
  const [banks, setBanks] = useState([]);
  const [paynowEnabled, setPaynowEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [bankOpen, setBankOpen] = useState(false);
  const [visible, setVisible] = useState(5);

  const load = () => {
    api.get("/withdrawals").then((r) => setHistory(r.data));
    api.get("/paynow/banks").then((r) => {
      setPaynowEnabled(!!r.data?.enabled);
      const list = r.data?.data || [];
      // sort alphabetically
      setBanks([...list].sort((a, b) => (a.bankName || "").localeCompare(b.bankName || "")));
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const filteredBanks = useMemo(() => {
    if (!bankQuery) return banks;
    const q = bankQuery.toLowerCase();
    return banks.filter((b) => (b.bankName || "").toLowerCase().includes(q) || (b.bankCode || "").toLowerCase().includes(q));
  }, [banks, bankQuery]);

  const canWithdraw = user?.has_invested;

  const submit = async (e) => {
    e.preventDefault();
    if (!canWithdraw) return;
    setLoading(true);
    try {
      await api.post("/withdrawals", { ...form, amount: Number(form.amount) });
      toast.success(paynowEnabled && form.bank_code
        ? "Withdrawal requested. Auto-payout on approval."
        : "Withdrawal requested. Awaiting admin approval.");
      setForm({ amount: "", bank_name: "", account_number: "", account_name: "", bank_code: "" });
      setBankQuery("");
      await refresh(); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pickBank = (b) => {
    setForm({ ...form, bank_code: b.bankCode, bank_name: b.bankName });
    setBankQuery(b.bankName);
    setBankOpen(false);
  };
  const clearBank = () => {
    setForm({ ...form, bank_code: "", bank_name: "" });
    setBankQuery("");
    setBankOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="withdraw-heading">Withdraw</h1>
        <p className="text-sm text-[#94A3B8] mt-1">Cash out to your Nigerian bank account.</p>
      </div>

      {!canWithdraw && (
        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-4 flex items-start gap-3" data-testid="withdraw-locked-banner">
          <Lock className="w-5 h-5 text-[#F59E0B] mt-0.5" />
          <div>
            <div className="font-display font-600 text-sm">Withdrawals unlock after your first investment.</div>
            <div className="text-xs text-[#94A3B8] mt-1">Pick a plan from the marketplace to unlock this feature.</div>
          </div>
        </div>
      )}

      {paynowEnabled && canWithdraw && (
        <div className="rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-4 flex items-start gap-3">
          <Zap className="w-5 h-5 text-[#0055FF] mt-0.5" />
          <div className="text-xs">
            <div className="font-display font-600 text-sm">Instant bank payout ({banks.length} banks)</div>
            <div className="text-[#94A3B8] mt-1">Search and select your bank — approval sends funds directly via PayNow.</div>
          </div>
        </div>
      )}

      <Card className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-xl">
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
            <div className="relative">
              <Label>Bank</Label>
              <div className="relative mt-2">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-[#94A3B8]" />
                <Input
                  placeholder="Search bank name or code…"
                  value={bankQuery}
                  onChange={(e) => { setBankQuery(e.target.value); setBankOpen(true); if (form.bank_code) setForm({ ...form, bank_code: "" }); }}
                  onFocus={() => setBankOpen(true)}
                  disabled={!canWithdraw}
                  data-testid="withdraw-bank-search"
                  className="pl-9 pr-16 bg-[#121E30] border-[#1A2B44] text-white h-11"
                />
                {form.bank_code && (
                  <button type="button" onClick={clearBank}
                          className="absolute right-2 top-1.5 text-xs px-2 py-1 rounded-md border border-[#1A2B44] text-[#94A3B8] hover:text-white">
                    Change
                  </button>
                )}
              </div>
              {bankOpen && canWithdraw && !form.bank_code && (
                <div
                  data-testid="bank-dropdown"
                  className="absolute z-30 mt-1 left-0 right-0 max-h-72 overflow-y-auto rounded-md border border-[#1A2B44] bg-[#0B1524] shadow-2xl"
                >
                  {filteredBanks.length === 0 ? (
                    <div className="p-3 text-xs text-center text-[#94A3B8]">No banks found</div>
                  ) : (
                    filteredBanks.map((b) => (
                      <button
                        type="button"
                        key={b.bankCode}
                        onClick={() => pickBank(b)}
                        data-testid={`bank-option-${b.bankCode}`}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-left hover:bg-[#121E30] transition-colors"
                      >
                        <span className="truncate">{b.bankName}</span>
                        <span className="text-[10px] text-[#94A3B8] tabular shrink-0">{b.bankCode}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {form.bank_code && (
                <div className="mt-2 text-xs text-[#10B981] flex items-center gap-1"><Check className="w-3 h-3"/>Selected: {form.bank_name} ({form.bank_code})</div>
              )}
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

      <section>
        <h2 className="font-display text-lg font-600 mb-3">Recent withdrawals</h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden divide-y divide-[#1A2B44]">
          {history.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#94A3B8]" data-testid="no-withdrawals">No withdrawals yet.</div>
          ) : (
            <>
              {history.slice(0, visible).map((w) => (
                <div key={w.id} className="flex items-center justify-between px-4 py-3 text-sm" data-testid={`withdraw-row-${w.id}`}>
                  <div className="min-w-0">
                    <div className="tabular font-display font-600">{formatNaira(w.amount)}</div>
                    <div className="text-xs text-[#94A3B8] truncate">{w.bank_name} · {w.account_number}</div>
                    <div className="text-xs text-[#94A3B8]">{new Date(w.created_at).toLocaleString()}</div>
                  </div>
                  <StatusPill status={w.status} />
                </div>
              ))}
              <LoadMore shown={Math.min(visible, history.length)} total={history.length} onMore={setVisible} testid="load-more-withdrawals" />
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
