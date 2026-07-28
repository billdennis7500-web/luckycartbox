import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Lock, Zap, Landmark, ArrowRight, Receipt, Wallet, Coins } from "lucide-react";
import { AmbientCard, SoftCard, SectionHeader, MicroLabel, PillCTA, StatChip, StackChip } from "@/components/design";

function BankLogo({ brand }) {
  const b = brand || {};
  return (
    <div
      className="w-11 h-11 shrink-0 rounded-xl grid place-items-center font-display font-800 tracking-wider text-xs shadow-inner"
      style={{
        background: b.bg || "linear-gradient(135deg,#0055FF,#003ec7)",
        color: b.fg || "#FFFFFF",
      }}
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
  const amountNum = Number(amount) || 0;
  const fee = amountNum * feePct / 100;
  const net = amountNum - fee;

  const submit = async (e) => {
    e.preventDefault();
    if (!canWithdraw || !hasAccount) return;
    setLoading(true);
    try {
      await api.post("/withdrawals", { amount: amountNum });
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
      <SectionHeader
        title="Withdraw"
        subtitle="Cash out to your saved Nigerian bank account."
        testid="withdraw-heading"
        right={
          <Link
            to="/withdraw-history"
            data-testid="withdraw-history-link"
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#F5C518]/40 bg-[#F5C518]/10 text-[#F5C518] text-xs font-display font-700 hover:bg-[#F5C518]/20 transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" /> History
          </Link>
        }
      />

      {/* Wallet available card */}
      <AmbientCard tone="gold" testid="withdraw-wallet-card">
        <div className="flex items-center justify-between">
          <div>
            <MicroLabel tone="gold">Available to withdraw</MicroLabel>
            <div className="mt-1 font-display font-800 text-3xl tabular text-white tracking-tight" data-testid="withdraw-wallet-amount">
              {formatNaira(user?.wallet_balance)}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl grid place-items-center"
               style={{ background: "linear-gradient(135deg,#FFE580,#F5C518)", boxShadow: "0 6px 20px rgba(245,197,24,0.45)" }}>
            <Wallet className="w-6 h-6 text-[#1A1508]" />
          </div>
        </div>
        {paynowEnabled && canWithdraw && (
          <div className="mt-4 pt-4 border-t border-[#F5C518]/20 flex items-center gap-2 text-[11px] text-[var(--nb-muted)]">
            <StatChip icon={Zap} label="Auto" value={autoPayout ? "Instant" : "On approval"} tone="tech" testid="withdraw-instant-chip" />
            <span className="opacity-80">
              {autoPayout ? "Fires the moment you submit." : "Approved payouts land in minutes."}
            </span>
          </div>
        )}
      </AmbientCard>

      {/* Locked banner */}
      {!canWithdraw && (
        <AmbientCard tone="hot" testid="withdraw-locked-banner">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl grid place-items-center"
                 style={{ background: "#F5C51818", border: "1px solid #F5C51840", color: "#F5C518" }}>
              <Lock className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-800 text-white text-base">Withdrawals unlock after your first investment.</div>
              <div className="text-xs text-[var(--nb-muted)] mt-1">Pick any plan from the marketplace — small amounts count too.</div>
              <Link to="/marketplace" className="inline-block mt-3">
                <PillCTA tone="purple" size="sm" testid="withdraw-locked-cta">Browse plans</PillCTA>
              </Link>
            </div>
          </div>
        </AmbientCard>
      )}

      {/* Bound bank account */}
      {hasAccount ? (
        <SoftCard testid="withdraw-bound-card">
          <div className="flex items-center gap-3">
            <BankLogo brand={bound.brand} />
            <div className="flex-1 min-w-0">
              <MicroLabel>Payout account</MicroLabel>
              <div className="mt-0.5 font-display font-700 text-white truncate">{bound.bank_name}</div>
              <div className="text-xs text-[var(--nb-muted)] tabular truncate mt-0.5">
                {bound.account_number} · {bound.account_name}
              </div>
            </div>
            <Link to="/bank-account" data-testid="withdraw-change-bank-link" className="shrink-0">
              <Button variant="outline" size="sm" className="border-[var(--nb-border)] bg-transparent text-white h-9 rounded-lg">
                Change
              </Button>
            </Link>
          </div>
        </SoftCard>
      ) : (
        <Link to="/bank-account" data-testid="withdraw-bind-cta" className="block">
          <SoftCard>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl grid place-items-center"
                   style={{ background: "#0055FF18", border: "1px solid #0055FF40", color: "#0055FF" }}>
                <Landmark className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-display font-700 text-white">Bind your bank account</div>
                <div className="text-[11px] text-[var(--nb-muted)] mt-0.5">
                  Add it once — every withdrawal after is one tap.
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--nb-muted)] shrink-0" />
            </div>
          </SoftCard>
        </Link>
      )}

      {/* Amount + fee card */}
      <AmbientCard tone="epic" testid="withdraw-form-card">
        <h2 className="font-display text-lg font-800 text-white mb-4">Request withdrawal</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <MicroLabel>Amount (₦)</MicroLabel>
            <Input
              type="number" min="1" step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={!canWithdraw || !hasAccount}
              placeholder="0"
              data-testid="withdraw-amount-input"
              className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-14 tabular font-display font-800 text-2xl text-center tracking-wider rounded-xl"
            />

            {feePct > 0 && amountNum > 0 && (
              <div
                data-testid="withdraw-fee-preview"
                className="mt-3 rounded-xl border border-[#F5C518]/30 bg-[#F5C518]/5 p-3 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[var(--nb-muted)]">You send</span>
                  <span className="tabular text-white font-700">{formatNaira(amountNum)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--nb-muted)]">Platform fee ({feePct}%)</span>
                  <span className="tabular text-[#F5C518] font-700">− {formatNaira(fee)}</span>
                </div>
                <div className="pt-2 mt-1 border-t border-[#F5C518]/20 flex items-center justify-between">
                  <span className="text-white font-display font-700">You receive</span>
                  <span className="tabular font-display font-800 text-lg text-[#10B981]" data-testid="withdraw-net-payout">
                    {formatNaira(net)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !canWithdraw || !hasAccount}
            data-testid="withdraw-submit-button"
            className="w-full h-12 rounded-full font-display font-800 text-sm text-[#1A1508] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-1.5"
            style={{
              background: "linear-gradient(135deg,#FFE580,#F5C518)",
              boxShadow: "0 8px 24px -6px rgba(245,197,24,0.55)",
            }}
          >
            <Coins className="w-4 h-4" />
            {loading ? "Submitting…" : "Request withdrawal"}
          </button>

          {!hasAccount && canWithdraw && (
            <p className="text-xs text-[#F59E0B] text-center" data-testid="withdraw-need-bank-hint">
              Bind a bank account first to enable withdrawals.
            </p>
          )}
        </form>
      </AmbientCard>
    </div>
  );
}
