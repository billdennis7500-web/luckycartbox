import React, { useState } from "react";
import { api, formatApiError, formatNaira } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ticket, Lock, Sparkles, ArrowRight, CheckCircle2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import { AmbientCard, SoftCard, SectionHeader, MicroLabel, PillCTA, StackChip } from "@/components/design";

export default function Coupon() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastReward, setLastReward] = useState(null);

  const redeem = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/coupons/redeem", { code });
      toast.success(`Coupon redeemed. ₦${data.amount.toLocaleString()} credited.`);
      setLastReward({ amount: data.amount, code });
      setCode("");
      await refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  const locked = !user?.has_invested;

  return (
    <div className="space-y-6 max-w-2xl mx-auto" data-testid="coupon-page">
      <SectionHeader
        title="Redeem a bonus code"
        subtitle="Instant naira credited straight to your wallet."
        testid="coupon-heading"
      />

      {/* Hero ticket — with notches, matches physical-ticket aesthetic */}
      <AmbientCard tone="gold" testid="coupon-hero">
        <div className="relative">
          {/* Ticket punch notches on the sides */}
          <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--nb-page)] border-r border-[#F5C518]/30" />
          <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--nb-page)] border-l border-[#F5C518]/30" />

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl grid place-items-center shrink-0"
                 style={{ background: "linear-gradient(135deg,#FFE580,#F5C518)",
                          boxShadow: "0 8px 26px -6px rgba(245,197,24,0.55)" }}>
              <Ticket className="w-8 h-8 text-[#1A1508]" />
            </div>
            <div className="flex-1 min-w-0">
              <MicroLabel tone="gold">Coupon</MicroLabel>
              <div className="mt-1 font-display font-800 text-lg text-white">
                Enter a promo code
              </div>
              <div className="text-xs text-[var(--nb-muted)] mt-0.5">
                Get instant wallet credit — no waiting for approval.
              </div>
            </div>
          </div>

          {/* Dashed divider mid-ticket */}
          <div className="my-5 h-[2px]"
               style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 6px,transparent 6px 12px)", opacity: 0.45 }} />

          <form onSubmit={redeem} className="space-y-4">
            <div>
              <MicroLabel tone="gold">Coupon code</MicroLabel>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                placeholder="ENTER-CODE"
                disabled={locked}
                data-testid="coupon-code-input"
                className="mt-2 bg-[var(--nb-card2)] border-[#F5C518]/30 text-white h-16 tracking-[0.35em] uppercase font-display font-800 text-2xl text-center rounded-xl focus:border-[#F5C518]/60 focus:ring-0"
              />
              <p className="text-[10px] text-[var(--nb-muted)] tabular mt-2 text-center">
                Codes are case-insensitive. Paste-friendly.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || locked}
              data-testid="coupon-redeem-button"
              className="w-full h-12 rounded-full font-display font-800 text-sm text-[#1A1508] disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg,#FFE580,#F5C518)",
                boxShadow: "0 8px 24px -6px rgba(245,197,24,0.55)",
              }}
            >
              <Sparkles className="w-4 h-4" />
              {loading ? "Redeeming…" : "Redeem code"}
            </button>
          </form>
        </div>
      </AmbientCard>

      {/* Locked banner */}
      {locked && (
        <SoftCard testid="coupon-locked-banner">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0"
                 style={{ background: "#F59E0B18", border: "1px solid #F59E0B40", color: "#F59E0B" }}>
              <Lock className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-700 text-sm text-white">Redemption locked</div>
              <div className="text-[11px] text-[var(--nb-muted)] mt-0.5">
                You must invest before redeeming coupon codes.
              </div>
            </div>
            <Link to="/marketplace" className="shrink-0">
              <PillCTA tone="purple" size="sm" testid="coupon-locked-invest-btn">
                Invest
              </PillCTA>
            </Link>
          </div>
        </SoftCard>
      )}

      {/* Success chip */}
      {lastReward && (
        <AmbientCard tone="success" testid="coupon-success">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                 style={{ background: "linear-gradient(135deg,#34D399,#10B981)",
                          boxShadow: "0 6px 20px rgba(16,185,129,0.45)" }}>
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <MicroLabel tone="success">Wallet credited</MicroLabel>
              <div className="mt-1 font-display font-800 text-xl tabular text-[#10B981]">
                +{formatNaira(lastReward.amount)}
              </div>
              <div className="text-[11px] text-[var(--nb-muted)] tabular mt-0.5">
                Code <code className="text-white">{lastReward.code}</code>
              </div>
            </div>
          </div>
        </AmbientCard>
      )}

      {/* Balance */}
      <SoftCard testid="coupon-wallet-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg grid place-items-center"
                 style={{ background: "#0055FF18", border: "1px solid #0055FF40", color: "#0055FF" }}>
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <MicroLabel>Current wallet</MicroLabel>
              <div className="mt-1 font-display font-800 tabular text-lg text-white" data-testid="coupon-wallet-balance">
                {formatNaira(user?.wallet_balance)}
              </div>
            </div>
          </div>
          <Link to="/deposit" className="text-xs text-[#0055FF] hover:underline flex items-center gap-1">
            Top up <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </SoftCard>
    </div>
  );
}
