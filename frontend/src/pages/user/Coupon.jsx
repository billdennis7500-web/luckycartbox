import React, { useState } from "react";
import { api, formatApiError, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ticket, Lock, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";

export default function Coupon() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastReward, setLastReward] = useState(null); // {amount, code}

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
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-card)] p-6">
        <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full bg-[#F59E0B]/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-[#0055FF]/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 grid place-items-center shrink-0">
            <Ticket className="w-6 h-6 text-[#F59E0B]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="coupon-heading">
              Redeem a bonus code
            </h1>
            <p className="text-sm text-[var(--nb-muted)] mt-1">
              Instant naira credited straight to your wallet.
            </p>
          </div>
        </div>
      </div>

      {locked && (
        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-4 flex items-start gap-3" data-testid="coupon-locked-banner">
          <Lock className="w-5 h-5 text-[#F59E0B] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-display font-600 text-sm">Redemption locked</div>
            <div className="text-xs text-[var(--nb-muted)] mt-1">You must invest before redeeming coupon codes.</div>
          </div>
          <Link to="/marketplace" className="shrink-0">
            <Button size="sm" className="bg-[#F59E0B] hover:bg-[#d97706] text-white">
              Invest <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* Ticket-styled form */}
      <div className="relative" data-testid="coupon-ticket">
        <div
          className="relative rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-card)] p-6 overflow-hidden"
          style={{
            backgroundImage:
              "radial-gradient(circle at 0 50%, transparent 12px, transparent 12px, transparent 100%), radial-gradient(circle at 100% 50%, transparent 12px, transparent 12px, transparent 100%)",
          }}
        >
          {/* Notches */}
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--nb-page)] border border-[var(--nb-border)]" />
          <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--nb-page)] border border-[var(--nb-border)]" />

          <form onSubmit={redeem} className="space-y-4">
            <div>
              <Label>Coupon code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                placeholder="ENTER-CODE"
                disabled={locked}
                data-testid="coupon-code-input"
                className="mt-2 bg-[var(--nb-page)] border-[var(--nb-border)] text-white h-14 tracking-[0.35em] uppercase font-display font-700 text-xl text-center"
              />
              <p className="text-[10px] text-[var(--nb-muted)] tabular mt-2 text-center">
                Codes are case-insensitive. Paste-friendly.
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading || locked}
              data-testid="coupon-redeem-button"
              className="w-full h-12 bg-[#F59E0B] hover:bg-[#d97706] rounded-xl text-white font-display font-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {loading ? "Redeeming…" : "Redeem code"}
            </Button>
          </form>
        </div>
      </div>

      {/* Success chip */}
      {lastReward && (
        <div className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 p-4 flex items-center gap-3" data-testid="coupon-success">
          <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0" />
          <div className="flex-1">
            <div className="font-display font-600 text-sm">Wallet credited</div>
            <div className="text-xs text-[var(--nb-muted)] mt-0.5">
              Code <code className="text-white">{lastReward.code}</code> added{" "}
              <span className="text-[#10B981] tabular">{formatNaira(lastReward.amount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Balance card */}
      <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Current wallet</div>
          <div className="mt-1 font-display font-800 tabular text-lg" data-testid="coupon-wallet-balance">
            {formatNaira(user?.wallet_balance)}
          </div>
        </div>
        <Link to="/deposit" className="text-xs text-[#0055FF] hover:underline">Top up →</Link>
      </Card>
    </div>
  );
}
