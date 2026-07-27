import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Lock, Zap, Landmark, ArrowRight, Receipt } from "lucide-react";

function BankLogo({ brand }) {
  const b = brand || {};
  return (
    <div
      className="w-10 h-10 shrink-0 rounded-full grid place-items-center font-display font-800 tracking-wider text-xs"
      style={{ background: b.bg || "#0055FF", color: b.fg || "#FFFFFF" }}
    >
      {b.initials || "BK"}
    </div>
  );
}

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const [amount, setAmount] = useState("");
  const [bound, setBound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paynowEnabled, setPaynowEnabled] = useState(false);
  const [feePct, setFeePct] = useState(0);
  const [autoPayout, setAutoPayout] = useState(false);

  const load = () => {
    api.get("/me/bank-account").then((r) => setBound(r.data)).catch(() => setBound(null));
    api.get("/paynow/banks").then((r) => setPaynowEnabled(!!r.data?.enabled)).catch(() => setPaynowEnabled(false));
    api.get("/settings/public").then((r) => {
      setFeePct(Number(r.data?.withdrawal_fee_pct) || 0);
      setAutoPayout(!!r.data?.auto_payout_enabled);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const canWithdraw = user?.has_invested;
  const hasAccount = !!(bound && bound.bank_name);

  const submit = async (e) => {
    e.preventDefault();
    if (!canWithdraw || !hasAccount) return;
    setLoading(true);
    try {
      await api.post("/withdrawals", { amount: Number(amount) });
      toast.success(paynowEnabled && bound.bank_code
        ? "Withdrawal requested. Auto-payout on approval."
        : "Withdrawal requested. Awaiting admin approval.");
      setAmount("");
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="withdraw-heading">Withdraw</h1>
          <p className="text-sm text-[var(--nb-muted)] mt-1">Cash out to your saved Nigerian bank account.</p>
        </div>
        <Link
          to="/withdraw-history"
          data-testid="withdraw-history-link"
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--nb-border)] bg-[var(--nb-card)] text-xs text-[var(--nb-muted)] hover:text-white hover:border-[#0055FF]/40 transition-colors"
        >
          <Receipt className="w-3.5 h-3.5" /> History
        </Link>
      </div>

      {!canWithdraw && (
        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-4 flex items-start gap-3" data-testid="withdraw-locked-banner">
          <Lock className="w-5 h-5 text-[#F59E0B] mt-0.5" />
          <div>
            <div className="font-display font-600 text-sm">Withdrawals unlock after your first investment.</div>
            <div className="text-xs text-[var(--nb-muted)] mt-1">Pick a plan from the marketplace to unlock this feature.</div>
          </div>
        </div>
      )}

      {paynowEnabled && canWithdraw && (
        <div className="rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-4 flex items-start gap-3" data-testid="withdraw-instant-banner">
          <Zap className="w-5 h-5 text-[#0055FF] mt-0.5" />
          <div className="text-xs">
            <div className="font-display font-600 text-sm">
              {autoPayout ? "Instant auto-payout enabled" : "Instant bank payout"}
            </div>
            <div className="text-[var(--nb-muted)] mt-1">
              {autoPayout
                ? "Your withdrawal fires the moment you submit — no waiting for admin review."
                : "Approved withdrawals land in your bank within minutes."}
            </div>
          </div>
        </div>
      )}

      {/* Bound bank account card */}
      {hasAccount ? (
        <Card data-testid="withdraw-bound-card"
              className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-2xl p-4 flex items-center gap-3">
          <BankLogo brand={bound.brand} />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-[var(--nb-muted)]">Payout account</div>
            <div className="font-display font-600 truncate">{bound.bank_name}</div>
            <div className="text-xs text-[var(--nb-muted)] tabular truncate">
              {bound.account_number} · {bound.account_name}
            </div>
          </div>
          <Link to="/bank-account" data-testid="withdraw-change-bank-link" className="shrink-0">
            <Button variant="outline" size="sm" className="border-[var(--nb-border)] bg-transparent text-white h-9">
              Change
            </Button>
          </Link>
        </Card>
      ) : (
        <Link to="/bank-account" data-testid="withdraw-bind-cta" className="block">
          <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-2xl p-4 flex items-center gap-3 hover:border-[#0055FF]/40 transition-colors">
            <div className="w-11 h-11 rounded-lg bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
              <Landmark className="w-5 h-5 text-[#0055FF]" />
            </div>
            <div className="flex-1">
              <div className="font-display font-600">Bind your bank account</div>
              <div className="text-xs text-[var(--nb-muted)] mt-0.5">
                Add it once — every withdrawal after is one tap.
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[var(--nb-muted)] shrink-0" />
          </Card>
        </Link>
      )}

      {/* Amount form */}
      <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] p-5 rounded-2xl">
        <h2 className="font-display text-lg font-600 mb-4">Request withdrawal</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Amount (₦)</Label>
            <Input
              type="number" min="1" step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={!canWithdraw || !hasAccount}
              data-testid="withdraw-amount-input"
              className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-12 tabular text-lg"
            />
            <p className="text-xs text-[var(--nb-muted)] mt-1">
              Available: <span className="text-white tabular">{formatNaira(user?.wallet_balance)}</span>
            </p>

            {/* Fee preview */}
            {feePct > 0 && Number(amount) > 0 && (
              <div
                data-testid="withdraw-fee-preview"
                className="mt-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[var(--nb-muted)]">You send</span>
                  <span className="tabular text-white">{formatNaira(Number(amount))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--nb-muted)]">Platform fee ({feePct}%)</span>
                  <span className="tabular text-[#F59E0B]">
                    − {formatNaira(Number(amount) * feePct / 100)}
                  </span>
                </div>
                <div className="pt-1 mt-1 border-t border-[#F59E0B]/20 flex items-center justify-between font-display">
                  <span className="text-white">You receive</span>
                  <span className="tabular font-800 text-[#10B981]" data-testid="withdraw-net-payout">
                    {formatNaira(Number(amount) - Number(amount) * feePct / 100)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <Button type="submit"
                  disabled={loading || !canWithdraw || !hasAccount}
                  data-testid="withdraw-submit-button"
                  className="w-full h-12 bg-[#0055FF] hover:bg-[#3377FF] rounded-xl glow-primary">
            {loading ? "Submitting…" : "Request withdrawal"}
          </Button>

          {!hasAccount && canWithdraw && (
            <p className="text-xs text-[#F59E0B] text-center" data-testid="withdraw-need-bank-hint">
              Bind a bank account first to enable withdrawals.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
