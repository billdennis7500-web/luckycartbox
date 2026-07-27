import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { StatusPill } from "@/pages/user/Deposit";
import { Lock, Zap, Landmark, ArrowRight } from "lucide-react";
import LoadMore from "@/components/LoadMore";

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
  const [history, setHistory] = useState([]);
  const [bound, setBound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(5);
  const [paynowEnabled, setPaynowEnabled] = useState(false);

  const load = () => {
    api.get("/withdrawals").then((r) => setHistory(r.data));
    api.get("/me/bank-account").then((r) => setBound(r.data)).catch(() => setBound(null));
    api.get("/paynow/banks")
      .then((r) => setPaynowEnabled(!!r.data?.enabled))
      .catch(() => setPaynowEnabled(false));
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
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="withdraw-heading">Withdraw</h1>
        <p className="text-sm text-[#94A3B8] mt-1">Cash out to your saved Nigerian bank account.</p>
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
        <div className="rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-4 flex items-start gap-3" data-testid="withdraw-instant-banner">
          <Zap className="w-5 h-5 text-[#0055FF] mt-0.5" />
          <div className="text-xs">
            <div className="font-display font-600 text-sm">Instant bank payout</div>
            <div className="text-[#94A3B8] mt-1">Approved withdrawals land in your bank within minutes.</div>
          </div>
        </div>
      )}

      {/* Bound bank account card */}
      {hasAccount ? (
        <Card data-testid="withdraw-bound-card"
              className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-4 flex items-center gap-3">
          <BankLogo brand={bound.brand} />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Payout account</div>
            <div className="font-display font-600 truncate">{bound.bank_name}</div>
            <div className="text-xs text-[#94A3B8] tabular truncate">
              {bound.account_number} · {bound.account_name}
            </div>
          </div>
          <Link to="/bank-account" data-testid="withdraw-change-bank-link" className="shrink-0">
            <Button variant="outline" size="sm" className="border-[#1A2B44] bg-transparent text-white h-9">
              Change
            </Button>
          </Link>
        </Card>
      ) : (
        <Link to="/bank-account" data-testid="withdraw-bind-cta"
              className="block">
          <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-4 flex items-center gap-3 hover:border-[#0055FF]/40 transition-colors">
            <div className="w-11 h-11 rounded-lg bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
              <Landmark className="w-5 h-5 text-[#0055FF]" />
            </div>
            <div className="flex-1">
              <div className="font-display font-600">Bind your bank account</div>
              <div className="text-xs text-[#94A3B8] mt-0.5">
                Add it once — every withdrawal after is one tap.
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
          </Card>
        </Link>
      )}

      {/* Amount form (disabled until account bound) */}
      <Card className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-2xl">
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
              className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12 tabular text-lg"
            />
            <p className="text-xs text-[#94A3B8] mt-1">
              Available: <span className="text-white tabular">{formatNaira(user?.wallet_balance)}</span>
            </p>
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

      <section>
        <h2 className="font-display text-lg font-600 mb-3">Recent withdrawals</h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl overflow-hidden divide-y divide-[#1A2B44]">
          {history.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#94A3B8]" data-testid="no-withdrawals">
              No withdrawals yet.
            </div>
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
