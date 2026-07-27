import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import {
  Search, Check, ChevronRight, Loader2, Trash2, ArrowLeft, AlertTriangle,
} from "lucide-react";

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

export default function BindAccount() {
  const nav = useNavigate();
  const [form, setForm] = useState({ bank_code: "", bank_name: "", account_number: "", account_name: "", brand: null });
  const [banks, setBanks] = useState([]);
  const [paynowEnabled, setPaynowEnabled] = useState(false);
  const [banksLoading, setBanksLoading] = useState(true);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [existing, setExisting] = useState(null);

  const loadBanks = () => {
    setBanksLoading(true);
    api.get("/paynow/banks")
      .then((r) => {
        setPaynowEnabled(!!r.data?.enabled);
        setBanks(r.data?.data || []);
      })
      .catch(() => toast.error("Couldn't load bank list. Tap Retry."))
      .finally(() => setBanksLoading(false));
  };

  useEffect(() => {
    loadBanks();
    api.get("/me/bank-account")
      .then((r) => {
        const acc = r.data;
        if (acc && acc.bank_name) {
          setExisting(acc);
          setForm({
            bank_code: acc.bank_code || "",
            bank_name: acc.bank_name || "",
            account_number: acc.account_number || "",
            account_name: acc.account_name || "",
            brand: acc.brand || null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setInitialLoad(false));
  }, []);

  const filteredBanks = useMemo(() => {
    if (!bankQuery) return banks;
    const q = bankQuery.toLowerCase();
    return banks.filter((b) =>
      (b.bankName || "").toLowerCase().includes(q) ||
      (b.bankCode || "").toLowerCase().includes(q)
    );
  }, [banks, bankQuery]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pickBank = (b) => {
    setForm({ ...form, bank_code: b.bankCode, bank_name: b.bankName, brand: b.brand });
    setBankQuery("");
    setBankOpen(false);
  };

  const clearBank = () => {
    setForm({ ...form, bank_code: "", bank_name: "", brand: null });
    setBankQuery("");
    setBankOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const digits = (form.account_number || "").replace(/\D/g, "");
    if (!form.bank_name) return toast.error("Choose your bank first");
    if (digits.length < 9) return toast.error("Enter a valid account number");
    if (!(form.account_name || "").trim()) return toast.error("Enter the account name");
    // One-last-look confirmation so users can't accidentally save a typo.
    const confirmMsg =
      `Please double-check:\n\n` +
      `Bank: ${form.bank_name}\n` +
      `Account #: ${digits}\n` +
      `Name: ${form.account_name.trim()}\n\n` +
      `Save this account? Wrong details can cause withdrawals to be lost.`;
    if (!window.confirm(confirmMsg)) return;
    setLoading(true);
    try {
      await api.post("/me/bank-account", {
        bank_code: form.bank_code,
        bank_name: form.bank_name,
        account_number: digits,
        account_name: form.account_name.trim(),
        brand: form.brand,
      });
      toast.success("Bank account saved");
      nav("/withdraw");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not save bank account");
    } finally { setLoading(false); }
  };

  const removeAccount = async () => {
    if (!existing) return;
    if (!window.confirm("Remove your saved bank account?")) return;
    try {
      await api.delete("/me/bank-account");
      toast.success("Bank account removed");
      setExisting(null);
      setForm({ bank_code: "", bank_name: "", account_number: "", account_name: "", brand: null });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not remove");
    }
  };

  return (
    <div className="space-y-6" data-testid="bind-account-page">
      <div className="flex items-center gap-3">
        <button
          onClick={() => nav(-1)}
          data-testid="bind-back-btn"
          className="w-9 h-9 rounded-lg border border-[var(--nb-border)] grid place-items-center text-[var(--nb-muted)] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="bind-account-heading">
            {existing ? "Edit bank account" : "Bind bank account"}
          </h1>
          <p className="text-xs text-[var(--nb-muted)] mt-1">
            One saved account keeps withdrawals a one-tap flow.
          </p>
        </div>
      </div>

      {existing && (
        <Card
          data-testid="current-bank-card"
          className="bg-[#0055FF]/10 border border-[#0055FF]/30 rounded-2xl p-4 flex items-center gap-3"
        >
          <BankLogo brand={existing.brand} />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-[var(--nb-muted)]">Currently bound</div>
            <div className="font-display font-600 truncate">{existing.bank_name}</div>
            <div className="text-xs text-[var(--nb-muted)] tabular truncate">
              {existing.account_number} · {existing.account_name}
            </div>
          </div>
          <button
            onClick={removeAccount}
            data-testid="bind-remove-btn"
            className="w-9 h-9 rounded-lg border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 grid place-items-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </Card>
      )}

      <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] p-5 rounded-2xl">
        <form onSubmit={submit} className="space-y-4">
          {/* Manual-entry warning — the platform no longer auto-fetches your
              account name from PayNow, so users must type every field carefully. */}
          <div
            data-testid="bind-manual-warning"
            className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-3 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
            <div className="text-[11px] leading-relaxed text-[var(--nb-text)]/90">
              <b>Please fill in your bank details carefully.</b> Withdrawals sent to a
              wrong bank / account number can be lost and may not be recoverable.
              Double-check every digit before saving.
            </div>
          </div>

          {/* Bank picker */}
          <div>
            <Label>Bank</Label>
            {paynowEnabled && banks.length > 0 ? (
              <button
                type="button"
                onClick={() => setBankOpen(true)}
                data-testid="bind-bank-trigger"
                className="mt-2 w-full flex items-center justify-between gap-3 px-3 h-12 rounded-md bg-[var(--nb-card2)] border border-[var(--nb-border)] hover:border-[#0055FF]/40 transition-colors"
              >
                {form.bank_code ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <BankLogo brand={form.brand} size="sm" />
                    <div className="min-w-0 text-left">
                      <div className="text-sm truncate">{form.bank_name}</div>
                      <div className="text-[10px] text-[var(--nb-muted)] tabular">{form.bank_code}</div>
                    </div>
                  </div>
                ) : (
                  <span className="text-sm text-[var(--nb-muted)]">Tap to pick a bank</span>
                )}
                {form.bank_code ? (
                  <span onClick={(e) => { e.stopPropagation(); clearBank(); }}
                        className="text-xs text-[var(--nb-muted)] hover:text-white px-2 py-1">
                    Change
                  </span>
                ) : (
                  <ChevronRight className="w-4 h-4 text-[var(--nb-muted)]" />
                )}
              </button>
            ) : banksLoading ? (
              <div data-testid="bind-banks-loading"
                   className="rounded-md border border-[var(--nb-border)] bg-[var(--nb-card2)] h-12 mt-2 flex items-center gap-2 px-3 text-sm text-[var(--nb-muted)]">
                <Loader2 className="w-4 h-4 animate-spin text-[#0055FF]" /> Loading Nigerian banks…
              </div>
            ) : (
              <div className="mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--nb-muted)]">Manual entry (bank list unavailable)</span>
                  <button type="button" onClick={loadBanks}
                          data-testid="bind-retry-banks"
                          className="text-xs text-[#0055FF] hover:underline">
                    Retry bank picker
                  </button>
                </div>
                <Input value={form.bank_name} onChange={set("bank_name")}
                       data-testid="bind-bank-input"
                       placeholder="Bank name" required
                       className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-12" />
              </div>
            )}
          </div>

          {/* Account number */}
          <div>
            <Label>Account number</Label>
            <Input value={form.account_number} onChange={set("account_number")}
                   required inputMode="numeric" maxLength={12}
                   data-testid="bind-accountnum-input"
                   className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-12 tabular tracking-wider" />
            <p className="text-[10px] text-[var(--nb-muted)] mt-1.5 tabular">
              Enter your NUBAN — usually 10 digits. Type slowly and double-check.
            </p>
          </div>

          {/* Account name */}
          <div>
            <Label>Account name</Label>
            <Input value={form.account_name} onChange={set("account_name")} required
                   data-testid="bind-accountname-input"
                   placeholder="Full name exactly as it appears on your bank record"
                   className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-12" />
            <p className="text-xs text-[var(--nb-muted)] mt-1">
              Must match your bank record character-for-character. Wrong names cause payouts to bounce.
            </p>
          </div>

          <Button type="submit" disabled={loading || initialLoad}
                  data-testid="bind-submit-btn"
                  className="w-full h-12 bg-[#0055FF] hover:bg-[#3377FF] rounded-xl glow-primary">
            {loading ? "Saving…" : existing ? "Update bank account" : "Save bank account"}
          </Button>
        </form>
      </Card>

      {/* Bank picker drawer */}
      <Drawer open={bankOpen} onOpenChange={setBankOpen}>
        <DrawerContent
          data-testid="bind-bank-drawer"
          className="bg-[var(--nb-card)] border-t border-[var(--nb-border)] text-white max-w-lg mx-auto rounded-t-2xl max-h-[85vh]"
        >
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-[var(--nb-border)]" />
          <DrawerHeader className="pb-2">
            <DrawerTitle className="font-display">Choose your bank</DrawerTitle>
            <DrawerDescription className="text-[var(--nb-muted)] text-xs">
              {banks.length} popular Nigerian banks and fintechs supported.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3.5 text-[var(--nb-muted)]" />
              <Input
                autoFocus
                placeholder="Search bank name…"
                value={bankQuery}
                onChange={(e) => setBankQuery(e.target.value)}
                data-testid="bind-bank-search"
                className="pl-9 h-11 bg-[var(--nb-page)] border-[var(--nb-border)] text-white"
              />
            </div>
          </div>

          <div className="overflow-y-auto pb-4" style={{ maxHeight: "60vh" }}>
            {filteredBanks.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--nb-muted)]">No banks found</div>
            ) : (
              filteredBanks.map((b) => {
                const isSelected = b.bankCode === form.bank_code;
                return (
                  <button
                    key={b.bankCode}
                    type="button"
                    onClick={() => pickBank(b)}
                    data-testid={`bind-bank-option-${b.bankCode}`}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--nb-card2)] transition-colors border-l-2 ${
                      isSelected ? "bg-[#0055FF]/10 border-l-[#0055FF]" : "border-l-transparent"
                    }`}
                  >
                    <BankLogo brand={b.brand} />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-sm truncate">{b.bankName}</div>
                      <div className="text-[10px] text-[var(--nb-muted)] tabular">{b.bankCode}</div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#0055FF] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <DrawerFooter className="pt-0">
            <DrawerClose asChild>
              <Button variant="outline" className="border-[var(--nb-border)] bg-transparent text-white h-11 rounded-xl">
                Close
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
