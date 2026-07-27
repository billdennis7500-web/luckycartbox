import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import {
  Copy, Zap, CheckCircle2, Loader2, Clock, X, Landmark, ArrowRight, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

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

/* -------------- payment method block -------------- */
function MethodBlock({ selected, onClick, tone, icon, label, sub, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`relative rounded-xl px-2 py-2.5 border transition-all overflow-hidden text-left flex flex-col justify-between min-h-[92px] ${
        selected
          ? "border-[#0055FF] ring-2 ring-[#0055FF]/40 bg-[#0B1524]"
          : "border-[#1A2B44] bg-[#0B1524] hover:border-[#0055FF]/50"
      }`}
    >
      {/* ambient tint */}
      <div
        className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-25 blur-2xl pointer-events-none"
        style={{ background: tone.bg }}
      />
      <div className="relative flex items-start justify-between">
        <div
          className="w-8 h-8 rounded-lg grid place-items-center font-display font-800 text-[10px] shrink-0"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {icon}
        </div>
        <span
          className={`w-3.5 h-3.5 rounded-full border grid place-items-center shrink-0 ${
            selected ? "bg-[#0055FF] border-[#0055FF]" : "border-[#1A2B44]"
          }`}
          aria-hidden
        >
          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
        </span>
      </div>
      <div className="relative mt-1.5">
        <div className="font-display font-700 text-[13px] leading-tight truncate">{label}</div>
        <div className="text-[10px] text-[#94A3B8] mt-0.5 truncate tabular">{sub}</div>
      </div>
    </button>
  );
}

/* -------------- quick amount chip -------------- */
function QuickAmount({ value, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      data-testid={`deposit-quick-${value}`}
      className={`h-10 rounded-lg text-xs font-display font-700 tabular border transition-colors ${
        selected
          ? "bg-[#0055FF] text-white border-[#0055FF]"
          : "bg-[#0B1524] border-[#1A2B44] text-white hover:border-[#0055FF]/40"
      }`}
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
    <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] || "bg-[#1A2B44]"}`}>
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
  const [initialLoad, setInitialLoad] = useState(true);
  const [quickAmounts, setQuickAmounts] = useState([500, 1000, 2000, 5000, 10000, 20000]);

  // waiting drawer state
  const [waitDep, setWaitDep] = useState(null);
  const [waitState, setWaitState] = useState("waiting");
  const pollRef = useRef(null);

  const load = () => {
    api.get("/payment-accounts").then((r) => setAccounts(r.data)).finally(() => setInitialLoad(false));
    api.get("/paynow/banks").then((r) => {
      setInstantEnabled(!!r.data?.enabled);
      setGatewayReady(r.data?.gateway_ready !== false);
    }).catch(() => { setInstantEnabled(false); setGatewayReady(false); });
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
  const selectedAcct = accounts.find((a) => a.id === method);
  const hasAnyMethod = instantEnabled || accounts.length > 0;

  const copy = async (val) => {
    try { await navigator.clipboard.writeText(String(val)); toast.success("Copied"); }
    catch { toast.error("Clipboard blocked — copy manually"); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!method) return toast.error("Choose a payment option");
    setLoading(true);
    try {
      const backendMethod = isInstant ? "paynow-auto" : method;
      const { data } = await api.post("/deposits", { amount: Number(amount), method: backendMethod, reference });
      if (data.gateway === "paynow") {
        // Always open the in-app drawer for PayNow — either shows the iframe (happy path)
        // or a clean inline "gateway unavailable" message (blocked path).
        setWaitDep(data);
        setWaitState(data.gateway_ready === false ? "unavailable" : "waiting");
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

  const closeWait = () => { setWaitDep(null); setWaitState("waiting"); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="deposit-heading">Deposit funds</h1>
          <p className="text-sm text-[#94A3B8] mt-1">Pick a payment option and add the amount you want to fund.</p>
        </div>
        <Link to="/deposit-history" data-testid="deposit-history-link"
              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#1A2B44] bg-[#0B1524] text-xs text-[#94A3B8] hover:text-white hover:border-[#0055FF]/40 transition-colors">
          <Receipt className="w-3.5 h-3.5" /> History
        </Link>
      </div>

      {/* Payment options — small equal blocks */}
      {initialLoad ? (
        <div className="rounded-2xl border border-dashed border-[#1A2B44] p-6 text-center text-sm text-[#94A3B8]" data-testid="deposit-loading">
          Loading payment options…
        </div>
      ) : !hasAnyMethod ? (
        <div className="rounded-2xl border border-dashed border-[#1A2B44] p-6 text-center text-sm text-[#94A3B8]" data-testid="deposit-none-available">
          No deposit options are available right now. Please contact support.
        </div>
      ) : (
        <section>
          <h2 className="font-display text-xs font-600 uppercase tracking-widest text-[#94A3B8] mb-3">
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
                  sub={gatewayReady ? "Auto credit" : "Temporarily slow"}
                  testid="deposit-method-instant"
                />
                {!gatewayReady && (
                  <span
                    className="absolute -top-1.5 -left-1.5 z-10 text-[9px] font-display font-700 uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[#F59E0B] text-black shadow"
                    data-testid="deposit-instant-slow-badge"
                  >
                    Slow
                  </span>
                )}
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
      {selectedAcct && !isInstant && (
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-4" data-testid="deposit-selected-panel">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl grid place-items-center font-display font-800 text-xs shrink-0"
              style={{ background: bankTint(selectedAcct.bank_name).bg, color: bankTint(selectedAcct.bank_name).fg }}
            >
              {initials(selectedAcct.bank_name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Transfer to</div>
              <div className="font-display font-600 truncate">{selectedAcct.bank_name}</div>
              <div className="text-xs text-[#94A3B8] truncate">{selectedAcct.account_name}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-display font-700 tabular tracking-wider text-lg text-white">
                  {selectedAcct.account_number}
                </span>
                <button
                  type="button"
                  onClick={() => copy(selectedAcct.account_number)}
                  data-testid="deposit-copy-selected"
                  className="w-7 h-7 rounded-md grid place-items-center border border-[#1A2B44] text-[#94A3B8] hover:text-white hover:border-[#0055FF]/40 shrink-0"
                  aria-label="Copy account number"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Amount + reference */}
      {hasAnyMethod && (
        <Card className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-2xl">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Amount (₦)</Label>
              <Input
                type="number" min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                disabled={!method}
                data-testid="deposit-amount-input"
                className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12 tabular text-lg"
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

            {!isInstant && selectedAcct && (
              <div>
                <Label>Transaction reference <span className="text-[#94A3B8]">(optional)</span></Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  data-testid="deposit-reference-input"
                  placeholder="Bank transfer ref / narration"
                  className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !method}
              data-testid="deposit-submit-button"
              className="w-full h-12 bg-[#0055FF] hover:bg-[#3377FF] rounded-xl glow-primary"
            >
              {loading ? "Processing…" : isInstant ? "Pay instantly" : "Submit for approval"}
            </Button>
          </form>
        </Card>
      )}

      {/* Waiting drawer (no PayNow branding) */}
      <Drawer open={!!waitDep} onOpenChange={(o) => !o && closeWait()}>
        <DrawerContent
          data-testid="waiting-drawer"
          className="bg-[#0B1524] border-t border-[#1A2B44] text-white max-w-xl mx-auto rounded-t-2xl max-h-[95vh]"
        >
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-[#1A2B44]" />
          <DrawerHeader className="pb-2">
            <DrawerTitle className="font-display flex items-center gap-2">
              {waitState === "approved" ? (
                <><CheckCircle2 className="w-5 h-5 text-[#10B981]" /> Payment received</>
              ) : waitState === "rejected" ? (
                <><X className="w-5 h-5 text-[#EF4444]" /> Payment failed</>
              ) : waitState === "unavailable" ? (
                <><Clock className="w-5 h-5 text-[#F59E0B]" /> Instant Pay is warming up</>
              ) : (
                <><Clock className="w-5 h-5 text-[#F59E0B]" /> Complete your payment</>
              )}
            </DrawerTitle>
            <DrawerDescription className="text-[#94A3B8] text-xs">
              {waitState === "approved"
                ? "Your wallet has been credited."
                : waitState === "rejected"
                ? "This payment was reported as failed or expired."
                : waitState === "unavailable"
                ? "Our gateway needs a moment to verify server access. Please choose a bank transfer option below, or retry in a few minutes."
                : `Amount ${formatNaira(waitDep?.amount || 0)} — this window will auto-update once received.`}
            </DrawerDescription>
          </DrawerHeader>

          {waitDep && (
            <div className="px-4 pb-3 space-y-3 overflow-y-auto" style={{ maxHeight: "calc(95vh - 180px)" }}>
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
                    Instant Pay is temporarily unavailable
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed max-w-md mx-auto">
                    {waitDep.gateway_message || "Our payment gateway is finalising server access checks. This usually clears in a few minutes."}
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
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
                      className="w-full h-11 border-[#1A2B44] bg-transparent text-white rounded-xl"
                    >
                      Try again later
                    </Button>
                  </div>
                </div>
              )}

              {/* Embedded checkout — no window.open, no visible URL bar */}
              {waitState === "waiting" && waitDep.checkout_url && (
                <div
                  className="relative rounded-xl border border-[#1A2B44] bg-white overflow-hidden"
                  style={{ height: "min(62vh, 560px)" }}
                >
                  <div className="absolute inset-0 grid place-items-center bg-[#0B1524] text-[#94A3B8] text-xs pointer-events-none z-0">
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
                    className="relative z-10 w-full h-full border-0"
                    data-testid="deposit-checkout-iframe"
                  />
                </div>
              )}

              {waitState === "waiting" && (
                <>
                  <div className="rounded-lg border border-[#0055FF]/40 bg-[#0055FF]/10 p-3 text-[11px] text-[#94A3B8] flex items-start gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-[#0055FF] animate-spin mt-0.5 shrink-0" />
                    <div>
                      Complete the transfer above. We'll auto-credit your wallet within a few seconds of receipt.
                      If it takes longer, tap the verify button below.
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={manualVerify}
                    disabled={waitState === "verifying"}
                    data-testid="manual-verify-btn"
                    className="w-full h-11 border-[#1A2B44] bg-transparent text-white rounded-xl"
                  >
                    {waitState === "verifying" ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Zap className="w-4 h-4 mr-2"/>}
                    I've paid — check now
                  </Button>
                </>
              )}

              {waitState === "verifying" && (
                <div className="rounded-xl border border-[#1A2B44] bg-[#121E30] p-6 text-center">
                  <Loader2 className="w-6 h-6 text-[#0055FF] animate-spin mx-auto" />
                  <div className="mt-2 text-sm text-[#94A3B8]">Checking payment…</div>
                </div>
              )}

              {waitState === "approved" && (
                <div className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 p-6 text-center" data-testid="approved-state">
                  <CheckCircle2 className="w-8 h-8 text-[#10B981] mx-auto" />
                  <div className="mt-3 font-display font-600">Wallet credited</div>
                  <div className="text-xs text-[#94A3B8] mt-1">
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
                  <div className="text-xs text-[#94A3B8] mt-1">
                    No money left your account. Try depositing again.
                  </div>
                </div>
              )}
            </div>
          )}

          <DrawerFooter className="pt-2">
            <DrawerClose asChild>
              <Button variant="outline" className="border-[#1A2B44] bg-transparent text-white h-11 rounded-xl" data-testid="waiting-close">
                {waitState === "approved" ? "Done" : "Close"}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
