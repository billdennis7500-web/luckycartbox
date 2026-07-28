import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Copy, Zap, CheckCircle2, Loader2, Clock, X, Landmark, ArrowRight, Receipt, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { SectionHeader } from "@/components/design";

/* -------------- helpers -------------- */
function bankTint(name = "") {
  const palette = [
    { bg: "#0055FF", fg: "#FFFFFF" },
    { bg: "#EB1C24", fg: "#FFFFFF" },
    { bg: "#009F4D", fg: "#FFFFFF" },
    { bg: "#B91E4B", fg: "#FFFFFF" },
    { bg: "#001F3F", fg: "#F4B21C" },
    { bg: "#5E17EB", fg: "#FFFFFF" },
    { bg: "#FF6600", fg: "#FFFFFF" },
    { bg: "#0A6EBD", fg: "#FFFFFF" },
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}
function initials(s = "") {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "BK";
}

/* -------------- payment method block — gold ambient tile -------------- */
function MethodBlock({ selected, onClick, tone, icon, label, sub, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`relative rounded-xl overflow-hidden text-left flex flex-col justify-between min-h-[98px] transition-all card-hover`}
      style={{
        background: "linear-gradient(135deg,#1E1B0A 0%,#231F0F 55%,#0B0906 100%)",
        boxShadow: selected
          ? `0 6px 24px -8px ${tone.bg}bb, 0 0 0 2px ${tone.bg}`
          : `0 4px 14px -6px ${tone.bg}55, 0 0 0 1px ${tone.bg}25`,
      }}
    >
      {/* Dashed accent line top */}
      <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
           style={{ background: `repeating-linear-gradient(90deg, ${tone.bg} 0 6px, transparent 6px 12px)`, opacity: selected ? 0.9 : 0.5 }} />
      {/* radial glow */}
      <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-25 blur-xl pointer-events-none"
           style={{ background: tone.bg }} />
      <div className="relative p-2.5 flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-lg grid place-items-center font-display font-800 text-[11px] shrink-0 shadow-inner"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {icon}
        </div>
        <span
          className="w-4 h-4 rounded-full grid place-items-center shrink-0 transition-colors"
          style={{
            background: selected ? tone.bg : "transparent",
            border: `1.5px solid ${selected ? tone.bg : "var(--nb-border)"}`,
          }}
          aria-hidden
        >
          {selected && <CheckCircle2 className="w-3 h-3" style={{ color: tone.fg }} />}
        </span>
      </div>
      <div className="relative px-2.5 pb-2.5 mt-1">
        <div className="font-display font-800 text-[13px] leading-tight text-white truncate">{label}</div>
        <div className="text-[10px] text-[var(--nb-muted)] mt-0.5 truncate tabular">{sub}</div>
      </div>
    </button>
  );
}

/* -------------- quick amount chip — gold aesthetic -------------- */
function QuickAmount({ value, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      data-testid={`deposit-quick-${value}`}
      className="h-11 rounded-full text-xs font-display font-800 tabular transition-all active:scale-[0.97]"
      style={
        selected
          ? {
              background: "linear-gradient(135deg,#FFE580,#F5C518)",
              color: "#1A1508",
              boxShadow: "0 6px 18px -4px rgba(245,197,24,0.55)",
            }
          : {
              background: "var(--nb-card)",
              color: "white",
              border: "1px solid rgba(245,197,24,0.28)",
            }
      }
    >
      ₦{value.toLocaleString()}
    </button>
  );
}

/* -------------- shared status pill (exported for use elsewhere) -------------- */
export function StatusPill({ status }) {
  const map = {
    pending: "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30",
    processing: "bg-[#0055FF]/15 text-[#0055FF] border-[#0055FF]/30",
    approved: "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30",
    rejected: "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30",
    failed: "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] || "bg-[var(--nb-border)]"}`}>
      {status}
    </span>
  );
}

/* ============= main ============= */
export default function Deposit() {
  const { refresh } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(""); // "instant-pay" | payment_account_id
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [instantEnabled, setInstantEnabled] = useState(false);
  const [gatewayReady, setGatewayReady] = useState(true);
  const [shpayEnabled, setShpayEnabled] = useState(false);
  const [shpayReady, setShpayReady] = useState(true);
  const [onesspayEnabled, setOnesspayEnabled] = useState(false);
  const [onesspayReady, setOnesspayReady] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [quickAmounts, setQuickAmounts] = useState([500, 1000, 2000, 5000, 10000, 20000]);

  // waiting drawer state
  const [waitDep, setWaitDep] = useState(null);
  const [waitState, setWaitState] = useState("waiting");
  // The `verifyRevealed` gate prevents users from confusing our "I've paid — check
  // now" CTA with PayNow's own in-iframe "I have made this bank transfer" button
  // (which submits the sender's name and finalises the checkout on PayNow's side).
  // Since the iframe is cross-origin we can't detect that click; instead we keep
  // our verify CTA hidden behind a small confirmation chip that the user must tap
  // AFTER completing the PayNow flow. Reset on every fresh checkout.
  const [verifyRevealed, setVerifyRevealed] = useState(false);
  const pollRef = useRef(null);

  const load = () => {
    api.get("/payment-accounts").then((r) => setAccounts(r.data)).finally(() => setInitialLoad(false));
    api.get("/paynow/banks").then((r) => {
      setInstantEnabled(!!r.data?.enabled);
      setGatewayReady(r.data?.gateway_ready !== false);
    }).catch(() => { setInstantEnabled(false); setGatewayReady(false); });
    api.get("/shpay/status").then((r) => {
      setShpayEnabled(!!r.data?.enabled);
      setShpayReady(r.data?.gateway_ready !== false);
    }).catch(() => { setShpayEnabled(false); setShpayReady(false); });
    api.get("/onesspay/status").then((r) => {
      setOnesspayEnabled(!!r.data?.enabled);
      setOnesspayReady(r.data?.gateway_ready !== false);
    }).catch(() => { setOnesspayEnabled(false); setOnesspayReady(false); });
    api.get("/settings/public").then((r) => {
      const qa = r.data?.deposit_quick_amounts;
      if (Array.isArray(qa) && qa.length) setQuickAmounts(qa.map(Number).filter(n => n > 0));
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // Auto-select the first available payment method as soon as we know what's available.
  useEffect(() => {
    if (method || initialLoad) return;
    if (instantEnabled) { setMethod("instant-pay"); return; }
    if (accounts.length > 0) { setMethod(accounts[0].id); }
  }, [instantEnabled, accounts, initialLoad, method]);

  useEffect(() => {
    if (!waitDep || waitState !== "waiting") return;
    pollRef.current = setInterval(async () => {
      try {
        const { data: deps } = await api.get("/deposits");
        const found = deps.find((d) => d.id === waitDep.id);
        if (found?.status === "approved") { setWaitState("approved"); await refresh(); load(); }
        else if (found?.status === "rejected") { setWaitState("rejected"); }
      } catch {}
    }, 5000);
    return () => pollRef.current && clearInterval(pollRef.current);
  }, [waitDep, waitState, refresh]);

  const isInstant = method === "instant-pay";
  const isShpay = method === "shpay-pay";
  const isOnesspay = method === "onesspay-pay";
  const selectedAcct = accounts.find((a) => a.id === method);
  const hasAnyMethod = instantEnabled || shpayEnabled || onesspayEnabled || accounts.length > 0;

  const copy = async (val) => {
    try { await navigator.clipboard.writeText(String(val)); toast.success("Copied"); }
    catch { toast.error("Clipboard blocked — copy manually"); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!method) return toast.error("Choose a payment option");
    setLoading(true);
    try {
      const backendMethod = isInstant ? "paynow-auto" : (isShpay ? "shpay-auto" : (isOnesspay ? "onesspay-auto" : method));
      const { data } = await api.post("/deposits", { amount: Number(amount), method: backendMethod, reference });
      if (data.gateway === "paynow" || data.gateway === "shpay" || data.gateway === "onesspay") {
        // All auto-flow gateways return either a checkout URL (happy path) or a
        // gateway_ready:false response — open the same in-app drawer for all.
        setWaitDep(data);
        setWaitState(data.gateway_ready === false ? "unavailable" : "waiting");
        setVerifyRevealed(false);
      } else {
        toast.success("Deposit submitted. Admin will approve shortly.");
      }
      setAmount(""); setReference("");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  const manualVerify = async () => {
    if (!waitDep) return;
    setWaitState("verifying");
    try {
      const { data } = await api.post(`/deposits/${waitDep.id}/verify`);
      if (data.status === "approved") { setWaitState("approved"); await refresh(); load(); }
      else { toast.info("Not confirmed yet. Try again in a moment."); setWaitState("waiting"); }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Verify failed");
      setWaitState("waiting");
    }
  };

  const closeWait = () => { setWaitDep(null); setWaitState("waiting"); setVerifyRevealed(false); };

  const [retryBusy, setRetryBusy] = useState(false);
  const retryGateway = async () => {
    setRetryBusy(true);
    try {
      const { data } = await api.post("/paynow/retry");
      if (data.gateway_ready) {
        toast.success("Gateway is back online — try Instant Pay now!");
        setGatewayReady(true);
        closeWait();
        // Refresh the deposit form so submit will create a real checkout
        setMethod("instant-pay");
      } else {
        // Update the drawer copy with the outbound IP so admin knows what to whitelist
        setWaitDep((w) => w ? { ...w, gateway_message:
          `Our payment gateway is still rejecting requests from this server (IP ${data.outbound_ip || "unknown"}). Add this IP to your PayNow merchant dashboard whitelist, then tap Retry.`,
          outbound_ip: data.outbound_ip,
        } : w);
        toast.info("Still unavailable — whitelist our IP at PayNow first.");
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Retry failed");
    } finally { setRetryBusy(false); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Deposit funds"
        subtitle="Pick a payment option and add the amount you want to fund."
        testid="deposit-heading"
        right={
          <Link to="/deposit-history" data-testid="deposit-history-link"
                className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#F5C518]/40 bg-[#F5C518]/10 text-[#F5C518] text-xs font-display font-700 hover:bg-[#F5C518]/20 transition-colors">
            <Receipt className="w-3.5 h-3.5" /> History
          </Link>
        }
      />

      {/* Payment options — small equal blocks */}
      {initialLoad ? (
        <div className="rounded-2xl border border-dashed border-[var(--nb-border)] p-6 text-center text-sm text-[var(--nb-muted)]" data-testid="deposit-loading">
          Loading payment options…
        </div>
      ) : !hasAnyMethod ? (
        <div className="rounded-2xl border border-dashed border-[var(--nb-border)] p-6 text-center text-sm text-[var(--nb-muted)]" data-testid="deposit-none-available">
          No deposit options are available right now. Please contact support.
        </div>
      ) : (
        <section>
          <h2 className="font-display text-xs font-600 uppercase tracking-widest text-[var(--nb-muted)] mb-3">
            Choose a payment option
          </h2>
          <div className="grid grid-cols-3 gap-3" data-testid="deposit-methods-grid">
            {instantEnabled && (
              <div className="relative">
                <MethodBlock
                  selected={isInstant}
                  onClick={() => setMethod("instant-pay")}
                  tone={{ bg: "#0055FF", fg: "#FFFFFF" }}
                  icon={<Zap className="w-5 h-5" />}
                  label="Instant Pay"
                  sub="Fast · Recommended"
                  testid="deposit-method-instant"
                />
                <span
                  className="absolute -top-1.5 -left-1.5 z-10 text-[9px] font-display font-700 uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[#10B981] text-white shadow"
                  data-testid="deposit-instant-recommended-badge"
                >
                  Fast
                </span>
              </div>
            )}
            {shpayEnabled && (
              <div className="relative">
                <MethodBlock
                  selected={isShpay}
                  onClick={() => setMethod("shpay-pay")}
                  tone={{ bg: "#8B5CF6", fg: "#FFFFFF" }}
                  icon={<Zap className="w-5 h-5" />}
                  label="Quick Pay"
                  sub="Bank transfer"
                  testid="deposit-method-shpay"
                />
                <span
                  className="absolute -top-1.5 -left-1.5 z-10 text-[9px] font-display font-700 uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[#8B5CF6] text-white shadow"
                  data-testid="deposit-shpay-badge"
                >
                  Auto
                </span>
              </div>
            )}
            {onesspayEnabled && (
              <div className="relative">
                <MethodBlock
                  selected={isOnesspay}
                  onClick={() => setMethod("onesspay-pay")}
                  tone={{ bg: "#F97316", fg: "#FFFFFF" }}
                  icon={<Zap className="w-5 h-5" />}
                  label="Fast Pay"
                  sub="Bank transfer"
                  testid="deposit-method-onesspay"
                />
                <span
                  className="absolute -top-1.5 -left-1.5 z-10 text-[9px] font-display font-700 uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[#F97316] text-white shadow"
                  data-testid="deposit-onesspay-badge"
                >
                  Auto
                </span>
              </div>
            )}
            {accounts.map((a) => {
              const brand = bankTint(a.bank_name);
              return (
                <MethodBlock
                  key={a.id}
                  selected={method === a.id}
                  onClick={() => setMethod(a.id)}
                  tone={brand}
                  icon={initials(a.bank_name)}
                  label={a.bank_name}
                  sub={a.account_number}
                  testid={`deposit-method-${a.id}`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Selected manual account detail */}
      {selectedAcct && !isInstant && !isShpay && !isOnesspay && (
        <div
          className="relative rounded-2xl overflow-hidden"
          data-testid="deposit-selected-panel"
          style={{ boxShadow: `0 6px 24px -8px ${bankTint(selectedAcct.bank_name).bg}55, 0 0 0 1px ${bankTint(selectedAcct.bank_name).bg}25` }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
               style={{ background: `repeating-linear-gradient(90deg,${bankTint(selectedAcct.bank_name).bg} 0 8px,transparent 8px 14px)`, opacity: 0.55 }} />
          <Card
            className="relative border-0 rounded-2xl p-4"
            style={{ background: "linear-gradient(135deg,#1E1B0A 0%,#231F0F 45%,#0B0906 100%)" }}
          >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl grid place-items-center font-display font-800 text-xs shrink-0"
              style={{ background: bankTint(selectedAcct.bank_name).bg, color: bankTint(selectedAcct.bank_name).fg }}
            >
              {initials(selectedAcct.bank_name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-[#F5C518]/80">Transfer to</div>
              <div className="font-display font-600 truncate text-white">{selectedAcct.bank_name}</div>
              <div className="text-xs text-[var(--nb-muted)] truncate">{selectedAcct.account_name}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-display font-700 tabular tracking-wider text-lg text-white">
                  {selectedAcct.account_number}
                </span>
                <button
                  type="button"
                  onClick={() => copy(selectedAcct.account_number)}
                  data-testid="deposit-copy-selected"
                  className="w-7 h-7 rounded-md grid place-items-center border border-[#F5C518]/30 text-[#F5C518] hover:text-white hover:border-[#F5C518]/60 shrink-0"
                  aria-label="Copy account number"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          </Card>
        </div>
      )}

      {/* Amount + reference */}
      {hasAnyMethod && (
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 6px 32px -8px #F5C51855, 0 0 0 1px #F5C51820" }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
               style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 8px,transparent 8px 14px)", opacity: 0.55 }} />
          <div className="absolute inset-x-0 bottom-0 h-[2px] pointer-events-none z-10"
               style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 8px,transparent 8px 14px)", opacity: 0.55 }} />
          <Card
            className="relative border-0 rounded-2xl p-5"
            style={{ background: "linear-gradient(135deg,#1E1B0A 0%,#231F0F 45%,#0B0906 100%)" }}
          >
          <form onSubmit={submit} className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#F5C518]/85 font-display font-700">
                Amount (₦)
              </div>
              <Input
                type="number" min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={!method}
                data-testid="deposit-amount-input"
                className="mt-2 bg-[var(--nb-card2)] border-[#F5C518]/30 focus:border-[#F5C518]/60 text-white h-12 tabular text-lg"
              />
              {/* Quick amount chips (admin-configurable) */}
              <div className="mt-3 grid grid-cols-3 gap-2" data-testid="deposit-quick-amounts">
                {quickAmounts.map((v) => (
                  <QuickAmount
                    key={v}
                    value={v}
                    selected={Number(amount) === v}
                    onClick={(val) => setAmount(String(val))}
                  />
                ))}
              </div>
              {!method && !initialLoad && (
                <p className="text-xs text-[#F59E0B] mt-2" data-testid="deposit-pick-method-hint">
                  Pick a payment option above to continue.
                </p>
              )}
            </div>

            {!isInstant && !isShpay && !isOnesspay && selectedAcct && (
              <div>
                <Label>Transaction reference <span className="text-[var(--nb-muted)]">(optional)</span></Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  data-testid="deposit-reference-input"
                  placeholder="Bank transfer ref / narration"
                  className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-12"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !method}
              data-testid="deposit-submit-button"
              className="w-full h-12 rounded-full font-display font-800 text-[15px] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg,#FFE580 0%,#F5C518 100%)",
                color: "#1A1508",
                boxShadow: "0 10px 28px -8px rgba(245,197,24,0.55)",
              }}
            >
              {loading ? "Processing…" : (isInstant || isShpay || isOnesspay) ? "Pay instantly" : "Submit for approval"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
          </Card>
        </div>
      )}

      {/* Full-screen checkout — no swipe-down, no gesture dismiss.
          Only closes via the explicit Close/Done button. No PayNow branding. */}
      {waitDep && (
        <div
          className="fixed inset-0 z-[60] bg-[var(--nb-card)] text-white flex flex-col overflow-hidden"
          data-testid="waiting-drawer"
          role="dialog"
          aria-modal="true"
        >
          {/* Header (fixed on top) */}
          <div className="shrink-0 border-b border-[var(--nb-border)] bg-[var(--nb-card)] px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#0055FF]/15 grid place-items-center shrink-0">
              {waitState === "approved" ? (
                <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
              ) : waitState === "rejected" ? (
                <X className="w-5 h-5 text-[#EF4444]" />
              ) : waitState === "unavailable" ? (
                <Clock className="w-5 h-5 text-[#F59E0B]" />
              ) : (
                <Clock className="w-5 h-5 text-[#F59E0B]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-700 leading-tight truncate" data-testid="waiting-title">
                {waitState === "approved"
                  ? "Payment received"
                  : waitState === "rejected"
                  ? "Payment failed"
                  : waitState === "unavailable"
                  ? (waitDep?.gateway === "shpay" ? "Quick Pay is warming up"
                     : waitDep?.gateway === "onesspay" ? "Fast Pay is warming up"
                     : "Instant Pay is warming up")
                  : "Complete your payment"}
              </div>
              <div className="text-[11px] text-[var(--nb-muted)] leading-tight truncate">
                {waitState === "approved"
                  ? "Your wallet has been credited."
                  : waitState === "rejected"
                  ? "This payment was reported as failed or expired."
                  : waitState === "unavailable"
                  ? "Choose a bank transfer below or tap Retry."
                  : `Amount ${formatNaira(waitDep?.amount || 0)} — auto-updates on receipt.`}
              </div>
            </div>
            {/* Only allow explicit dismissal AFTER the final states — never mid-flight */}
            {(waitState === "approved" || waitState === "rejected" || waitState === "unavailable") && (
              <button
                type="button"
                onClick={closeWait}
                data-testid="waiting-header-close"
                className="w-9 h-9 rounded-lg grid place-items-center border border-[var(--nb-border)] text-[var(--nb-muted)] hover:text-white hover:border-[#0055FF]/40 shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Body — during PayNow "waiting" state we hand almost the entire viewport
              to the iframe (no padding, no separator noise) so users get a real
              full-screen checkout experience. Other states keep normal padding. */}
          <div className={
            waitState === "waiting"
              ? "flex-1 overflow-hidden"
              : "flex-1 overflow-y-auto px-4 py-4 space-y-3"
          }>
              {/* Gateway unavailable state — clean inline explainer, no PayNow branding */}
              {waitState === "unavailable" && (
                <div
                  className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-5 text-center"
                  data-testid="deposit-gateway-unavailable"
                >
                  <div className="w-12 h-12 mx-auto rounded-xl grid place-items-center bg-[#F59E0B]/20">
                    <Clock className="w-6 h-6 text-[#F59E0B]" />
                  </div>
                  <div className="mt-3 font-display font-700 text-white">
                    {waitDep?.gateway === "shpay" ? "Quick Pay is warming up"
                     : waitDep?.gateway === "onesspay" ? "Fast Pay is warming up"
                     : "Instant Pay is warming up"}
                  </div>
                  <div className="text-xs text-[var(--nb-muted)] mt-1.5 leading-relaxed max-w-md mx-auto">
                    {waitDep.gateway_message || "Our payment gateway is finalising server access checks. This usually clears in a few minutes."}
                  </div>
                  {waitDep.outbound_ip && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--nb-card)] border border-[var(--nb-border)] text-xs tabular text-white">
                      <span className="text-[var(--nb-muted)]">Server IP:</span>
                      <span className="font-display font-700">{waitDep.outbound_ip}</span>
                      <button
                        type="button"
                        onClick={() => copy(waitDep.outbound_ip)}
                        className="text-[#0055FF] hover:text-[#3377FF]"
                        data-testid="copy-outbound-ip"
                        aria-label="Copy server IP"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="mt-4 flex flex-col gap-2">
                    <Button
                      onClick={retryGateway}
                      disabled={retryBusy}
                      data-testid="deposit-retry-gateway"
                      className="w-full h-11 bg-[#10B981] hover:bg-[#0EA97A] rounded-xl"
                    >
                      {retryBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Retry now
                    </Button>
                    {accounts.length > 0 && (
                      <Button
                        onClick={() => { closeWait(); setMethod(accounts[0].id); }}
                        data-testid="deposit-fallback-bank"
                        className="w-full h-11 bg-[#0055FF] hover:bg-[#3377FF] rounded-xl"
                      >
                        Use bank transfer instead
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={closeWait}
                      data-testid="deposit-unavailable-close"
                      className="w-full h-11 border-[var(--nb-border)] bg-transparent text-white rounded-xl"
                    >
                      Try again later
                    </Button>
                  </div>
                </div>
              )}

              {/* Embedded checkout — fills the whole body (edge to edge) */}
              {waitState === "waiting" && waitDep.checkout_url && (
                <div className="relative bg-white h-full w-full">
                  <div className="absolute inset-0 grid place-items-center bg-[var(--nb-card)] text-[var(--nb-muted)] text-xs pointer-events-none z-0">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#0055FF]" />
                      Loading secure payment page…
                    </div>
                  </div>
                  <iframe
                    key={waitDep.id}
                    src={waitDep.checkout_url}
                    title="Secure payment"
                    referrerPolicy="no-referrer"
                    sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
                    className="relative z-10 w-full h-full border-0 block"
                    data-testid="deposit-checkout-iframe"
                  />
                </div>
              )}

              {waitState === "verifying" && (
                <div className="rounded-xl border border-[var(--nb-border)] bg-[var(--nb-card2)] p-6 text-center">
                  <Loader2 className="w-6 h-6 text-[#0055FF] animate-spin mx-auto" />
                  <div className="mt-2 text-sm text-[var(--nb-muted)]">Checking payment…</div>
                </div>
              )}

              {waitState === "approved" && (
                <div className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 p-6 text-center" data-testid="approved-state">
                  <CheckCircle2 className="w-8 h-8 text-[#10B981] mx-auto" />
                  <div className="mt-3 font-display font-600">Wallet credited</div>
                  <div className="text-xs text-[var(--nb-muted)] mt-1">
                    {formatNaira(waitDep.amount)} is now in your wallet. Go invest.
                  </div>
                  <Link to="/marketplace" onClick={closeWait} className="inline-flex mt-3 text-xs text-[#0055FF] hover:underline items-center gap-1">
                    Browse plans <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              )}

              {waitState === "rejected" && (
                <div className="rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 p-6 text-center" data-testid="rejected-state">
                  <X className="w-8 h-8 text-[#EF4444] mx-auto" />
                  <div className="mt-3 font-display font-600">Payment failed</div>
                  <div className="text-xs text-[var(--nb-muted)] mt-1">
                    No money left your account. Try depositing again.
                  </div>
                </div>
              )}
          </div>

          {/* Footer (fixed on bottom) */}
          <div className="shrink-0 border-t border-[var(--nb-border)] bg-[var(--nb-card)] px-4 py-3">
            {waitState === "waiting" ? (
              verifyRevealed ? (
                <div className="flex items-center gap-2" data-testid="footer-verify-revealed">
                  <Button
                    onClick={manualVerify}
                    data-testid="manual-verify-btn"
                    className="flex-1 h-11 bg-[#10B981] hover:bg-[#0EA97A] rounded-xl"
                  >
                    <Zap className="w-4 h-4 mr-2" /> I've paid — check now
                  </Button>
                  <Button
                    variant="outline"
                    onClick={closeWait}
                    className="w-24 border-[var(--nb-border)] bg-transparent text-white h-11 rounded-xl"
                    data-testid="waiting-close"
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2" data-testid="footer-verify-hidden">
                  <button
                    type="button"
                    onClick={() => setVerifyRevealed(true)}
                    data-testid="reveal-verify-btn"
                    className="w-full text-[11px] text-[var(--nb-muted)] hover:text-[#0055FF] py-1 underline underline-offset-2 transition-colors"
                  >
                    Already submitted your name on the form? Verify manually
                  </button>
                  <Button
                    variant="outline"
                    onClick={closeWait}
                    className="w-full border-[var(--nb-border)] bg-transparent text-white h-11 rounded-xl"
                    data-testid="waiting-close"
                  >
                    Close
                  </Button>
                </div>
              )
            ) : (
              <Button
                variant="outline"
                onClick={closeWait}
                disabled={waitState === "verifying"}
                className="w-full border-[var(--nb-border)] bg-transparent text-white h-11 rounded-xl"
                data-testid="waiting-close"
              >
                {waitState === "approved" ? "Done" : "Close"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
