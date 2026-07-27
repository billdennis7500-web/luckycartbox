import React, { useEffect, useMemo, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/pages/user/Deposit";
import { Lock, Zap, Search, Check, ChevronRight, Loader2, ShieldCheck, X } from "lucide-react";
import LoadMore from "@/components/LoadMore";

function BankLogo({ brand, size = "md" }) {
  const dim = size === "sm" ? "w-8 h-8 text-[10px]" : "w-10 h-10 text-xs";
  const b = brand || {};
  return (
    <div
      className={`${dim} shrink-0 rounded-full grid place-items-center font-display font-800 tracking-wider`}
      style={{ background: b.bg || "#0055FF", color: b.fg || "#FFFFFF" }}
    >
      {b.initials || "BK"}
    </div>
  );
}

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ amount: "", bank_name: "", account_number: "", account_name: "", bank_code: "", brand: null });
  const [history, setHistory] = useState([]);
  const [banks, setBanks] = useState([]);
  const [paynowEnabled, setPaynowEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [bankOpen, setBankOpen] = useState(false);
  const [visible, setVisible] = useState(5);
  const [verify, setVerify] = useState({ status: "idle", exists: null });
  const [banksLoading, setBanksLoading] = useState(true);

  const load = () => {
    api.get("/withdrawals").then((r) => setHistory(r.data));
    setBanksLoading(true);
    api.get("/paynow/banks")
      .then((r) => {
        setPaynowEnabled(!!r.data?.enabled);
        setBanks(r.data?.data || []);
      })
      .catch((e) => {
        toast.error("Couldn't load bank list — using manual entry. Tap Retry.");
      })
      .finally(() => setBanksLoading(false));
  };
  const retryBanks = () => load();
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
      await api.post("/withdrawals", {
        amount: Number(form.amount),
        bank_name: form.bank_name, bank_code: form.bank_code,
        account_number: form.account_number, account_name: form.account_name,
      });
      toast.success(paynowEnabled && form.bank_code
        ? "Withdrawal requested. Auto-payout on approval."
        : "Withdrawal requested. Awaiting admin approval.");
      setForm({ amount: "", bank_name: "", account_number: "", account_name: "", bank_code: "", brand: null });
      setBankQuery("");
      setVerify({ status: "idle", exists: null });
      await refresh(); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pickBank = (b) => {
    setForm({ ...form, bank_code: b.bankCode, bank_name: b.bankName, brand: b.brand });
    setBankQuery("");
    setBankOpen(false);
    setVerify({ status: "idle", exists: null });
  };
  const clearBank = () => {
    setForm({ ...form, bank_code: "", bank_name: "", brand: null });
    setBankQuery("");
    setBankOpen(true);
    setVerify({ status: "idle", exists: null });
  };

  const canVerify = form.bank_code && (form.account_number || "").replace(/\D/g, "").length >= 10;

  const runVerify = async () => {
    if (!canVerify) return;
    setVerify({ status: "loading", exists: null });
    try {
      const { data } = await api.post("/paynow/verify-account", {
        bank_code: form.bank_code,
        account_number: form.account_number,
      });
      setVerify({ status: "done", exists: !!data.exists });
    } catch (e) {
      setVerify({ status: "error", exists: null });
      toast.error(formatApiError(e.response?.data?.detail) || "Verification failed");
    }
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
            <div className="font-display font-600 text-sm">Instant bank payout</div>
            <div className="text-[#94A3B8] mt-1">Tap the bank field to pick your bank. We verify the account before you hit send.</div>
          </div>
        </div>
      )}

      <Card className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-2xl">
        <h2 className="font-display text-lg font-600 mb-4">Request withdrawal</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Amount (₦)</Label>
            <Input type="number" min="1" value={form.amount} onChange={set("amount")} required disabled={!canWithdraw}
                   data-testid="withdraw-amount-input"
                   className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12 tabular" />
            <p className="text-xs text-[#94A3B8] mt-1">Available: {formatNaira(user?.wallet_balance)}</p>
          </div>

          {paynowEnabled && banks.length > 0 ? (
            <div>
              <Label>Bank</Label>
              <button
                type="button"
                onClick={() => canWithdraw && setBankOpen(true)}
                disabled={!canWithdraw}
                data-testid="withdraw-bank-trigger"
                className="mt-2 w-full flex items-center justify-between gap-3 px-3 h-12 rounded-md bg-[#121E30] border border-[#1A2B44] hover:border-[#0055FF]/40 disabled:opacity-50 transition-colors"
              >
                {form.bank_code ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <BankLogo brand={form.brand} size="sm" />
                    <div className="min-w-0 text-left">
                      <div className="text-sm truncate">{form.bank_name}</div>
                      <div className="text-[10px] text-[#94A3B8] tabular">{form.bank_code}</div>
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-[#94A3B8]">Tap to pick a bank</span>
                )}
                {form.bank_code ? (
                  <span onClick={(e) => { e.stopPropagation(); clearBank(); }}
                        className="text-xs text-[#94A3B8] hover:text-white px-2 py-1">Change</span>
                ) : (
                  <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                )}
              </button>
            </div>
          ) : banksLoading ? (
            <div data-testid="banks-loading" className="rounded-md border border-[#1A2B44] bg-[#121E30] h-12 mt-2 flex items-center gap-2 px-3 text-sm text-[#94A3B8]">
              <Loader2 className="w-4 h-4 animate-spin text-[#0055FF]" /> Loading Nigerian banks…
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <Label>Bank name</Label>
                <button type="button" onClick={retryBanks} data-testid="retry-banks"
                        className="text-xs text-[#0055FF] hover:underline">Retry bank picker</button>
              </div>
              <Input value={form.bank_name} onChange={set("bank_name")} required disabled={!canWithdraw}
                     data-testid="withdraw-bank-input"
                     className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12" />
            </div>
          )}

          <div>
            <Label>Account number</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input value={form.account_number} onChange={set("account_number")} required disabled={!canWithdraw}
                     inputMode="numeric" maxLength={12}
                     data-testid="withdraw-accountnum-input"
                     className="bg-[#121E30] border-[#1A2B44] text-white h-12 tabular tracking-wider" />
              {paynowEnabled && (
                <Button
                  type="button"
                  onClick={runVerify}
                  disabled={!canVerify || verify.status === "loading"}
                  data-testid="withdraw-verify-btn"
                  variant="outline"
                  className="h-12 shrink-0 border-[#0055FF]/40 bg-transparent text-[#0055FF] hover:bg-[#0055FF]/10"
                >
                  {verify.status === "loading" ? <Loader2 className="w-4 h-4 animate-spin"/> : <ShieldCheck className="w-4 h-4"/>}
                  <span className="ml-1 hidden sm:inline">Verify</span>
                </Button>
              )}
            </div>
            {verify.status === "done" && (
              <div
                data-testid="withdraw-verify-result"
                className={`mt-2 text-xs px-3 py-2 rounded-md border flex items-center gap-2 ${
                  verify.exists
                    ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]"
                    : "bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]"
                }`}
              >
                {verify.exists ? <Check className="w-3 h-3"/> : <X className="w-3 h-3"/>}
                {verify.exists
                  ? "Bank confirms account is reachable. Fill in the account name below exactly as it appears on your bank record."
                  : "PayNow could not verify this account. You can still proceed — the transfer will fail with a clear error if the number is wrong."}
              </div>
            )}
          </div>

          <div>
            <Label>Account name</Label>
            <Input value={form.account_name} onChange={set("account_name")} required disabled={!canWithdraw}
                   data-testid="withdraw-accountname-input"
                   className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12" />
            <p className="text-xs text-[#94A3B8] mt-1">Enter it exactly as your bank shows it — mismatches may reverse the payout.</p>
          </div>

          <Button type="submit" disabled={loading || !canWithdraw}
                  data-testid="withdraw-submit-button"
                  className="w-full h-12 bg-[#0055FF] hover:bg-[#3377FF] rounded-xl glow-primary">
            {loading ? "Submitting…" : "Request withdrawal"}
          </Button>
        </form>
      </Card>

      {/* Slide-up bank picker drawer */}
      <Drawer open={bankOpen} onOpenChange={setBankOpen}>
        <DrawerContent
          data-testid="bank-picker-drawer"
          className="bg-[#0B1524] border-t border-[#1A2B44] text-white max-w-lg mx-auto rounded-t-2xl max-h-[85vh]"
        >
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-[#1A2B44]" />
          <DrawerHeader className="pb-2">
            <DrawerTitle className="font-display">Choose your bank</DrawerTitle>
            <DrawerDescription className="text-[#94A3B8] text-xs">
              {banks.length} popular Nigerian banks and fintechs supported.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3.5 text-[#94A3B8]" />
              <Input
                autoFocus
                placeholder="Search bank name…"
                value={bankQuery}
                onChange={(e) => setBankQuery(e.target.value)}
                data-testid="bank-picker-search"
                className="pl-9 h-11 bg-[#020813] border-[#1A2B44] text-white"
              />
            </div>
          </div>

          <div className="overflow-y-auto pb-4" style={{ maxHeight: "60vh" }}>
            {filteredBanks.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#94A3B8]">No banks found</div>
            ) : (
              filteredBanks.map((b) => {
                const isSelected = b.bankCode === form.bank_code;
                return (
                  <button
                    key={b.bankCode}
                    type="button"
                    onClick={() => pickBank(b)}
                    data-testid={`bank-option-${b.bankCode}`}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#121E30] transition-colors border-l-2 ${
                      isSelected ? "bg-[#0055FF]/10 border-l-[#0055FF]" : "border-l-transparent"
                    }`}
                  >
                    <BankLogo brand={b.brand} />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm truncate">{b.bankName}</div>
                      <div className="text-[10px] text-[#94A3B8] tabular">{b.bankCode}</div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#0055FF] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <DrawerFooter className="pt-0">
            <DrawerClose asChild>
              <Button variant="outline" className="border-[#1A2B44] bg-transparent text-white h-11 rounded-xl">
                Close
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <section>
        <h2 className="font-display text-lg font-600 mb-3">Recent withdrawals</h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl overflow-hidden divide-y divide-[#1A2B44]">
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
