import React, { useEffect, useRef, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { Copy, Banknote, Zap, ExternalLink, CheckCircle2, Loader2, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import LoadMore from "@/components/LoadMore";

export default function Deposit() {
  const { refresh } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [history, setHistory] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [paynowEnabled, setPaynowEnabled] = useState(false);
  const [visible, setVisible] = useState(5);

  // "Waiting for payment" state
  const [waitDep, setWaitDep] = useState(null);           // the deposit being tracked
  const [waitState, setWaitState] = useState("waiting");  // waiting | verifying | approved | rejected
  const pollRef = useRef(null);

  const load = () => {
    api.get("/payment-accounts").then((r) => setAccounts(r.data));
    api.get("/deposits").then((r) => setHistory(r.data));
    api.get("/paynow/banks").then((r) => setPaynowEnabled(!!r.data?.enabled)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // Poll every 5s while waiting
  useEffect(() => {
    if (!waitDep || waitState !== "waiting") return;
    pollRef.current = setInterval(async () => {
      try {
        const { data: deps } = await api.get("/deposits");
        const found = deps.find((d) => d.id === waitDep.id);
        if (found && found.status === "approved") {
          setWaitState("approved");
          await refresh();
          load();
        } else if (found && found.status === "rejected") {
          setWaitState("rejected");
        }
      } catch {}
    }, 5000);
    return () => pollRef.current && clearInterval(pollRef.current);
  }, [waitDep, waitState, refresh]);

  const submit = async (e) => {
    e.preventDefault();
    if (!method) { toast.error("Choose a payment option"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/deposits", { amount: Number(amount), method, reference });
      if (data.gateway === "paynow" && data.checkout_url) {
        setWaitDep(data);
        setWaitState("waiting");
        try { window.open(data.checkout_url, "_blank", "noopener,noreferrer"); } catch {}
      } else {
        toast.success("Deposit submitted. Admin will approve shortly.");
      }
      setAmount(""); setReference("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  const manualVerify = async () => {
    if (!waitDep) return;
    setWaitState("verifying");
    try {
      const { data } = await api.post(`/deposits/${waitDep.id}/verify`);
      if (data.status === "approved") {
        setWaitState("approved");
        await refresh();
        load();
      } else {
        toast.info("Not yet — PayNow hasn't confirmed the payment. Try again in a moment.");
        setWaitState("waiting");
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Verify failed");
      setWaitState("waiting");
    }
  };

  const closeWait = () => {
    setWaitDep(null);
    setWaitState("waiting");
  };

  const selectedAccount = accounts.find((a) => a.id === method);
  const isPaynow = method === "paynow-auto";
  const copy = (val) => { navigator.clipboard.writeText(val); toast.success("Copied"); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="deposit-heading">Deposit funds</h1>
        <p className="text-sm text-[#94A3B8] mt-1">Pay instantly via PayNow or transfer manually.</p>
      </div>

      <Card className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-2xl">
        <h2 className="font-display text-lg font-600 mb-4">New deposit</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger data-testid="deposit-account-select" className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12">
                <SelectValue placeholder="Choose method" />
              </SelectTrigger>
              <SelectContent className="bg-[#0B1524] border-[#1A2B44] text-white">
                {paynowEnabled && (
                  <SelectItem value="paynow-auto" data-testid="opt-paynow">
                    ⚡ PayNow (instant · auto-credit)
                  </SelectItem>
                )}
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.bank_name} — {a.account_number} (manual)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isPaynow && (
            <div className="rounded-lg border border-[#0055FF]/40 bg-[#0055FF]/10 p-4 text-sm flex items-start gap-3">
              <Zap className="w-5 h-5 text-[#0055FF] mt-0.5" />
              <div>
                <div className="font-display font-600">Instant deposit</div>
                <div className="text-[#94A3B8] mt-1">
                  You'll be redirected to PayNow. Once you pay, this app auto-credits your wallet within seconds.
                </div>
              </div>
            </div>
          )}

          {selectedAccount && !isPaynow && (
            <div className="rounded-lg border border-[#1A2B44] bg-[#121E30] p-4 text-sm space-y-2">
              <div className="flex items-center justify-between"><span className="text-[#94A3B8]">Bank</span><span>{selectedAccount.bank_name}</span></div>
              <div className="flex items-center justify-between"><span className="text-[#94A3B8]">Account name</span><span>{selectedAccount.account_name}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Account number</span>
                <button type="button" onClick={() => copy(selectedAccount.account_number)} className="flex items-center gap-1 tabular font-display font-600">
                  {selectedAccount.account_number} <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <div>
            <Label>Amount (₦)</Label>
            <Input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required
                   data-testid="deposit-amount-input"
                   className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12 tabular" />
          </div>
          {!isPaynow && method && (
            <div>
              <Label>Transaction reference <span className="text-[#94A3B8]">(optional)</span></Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)}
                     data-testid="deposit-reference-input"
                     className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12" />
            </div>
          )}
          <Button type="submit" disabled={loading} data-testid="deposit-submit-button"
                  className="w-full h-12 bg-[#0055FF] hover:bg-[#3377FF] rounded-xl glow-primary">
            {loading ? "Processing…" : (isPaynow ? "Pay with PayNow" : "Submit for approval")}
          </Button>
        </form>
      </Card>

      <section>
        <h2 className="font-display text-lg font-600 mb-3">Deposit history</h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-[#1A2B44]">
              {history.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-[#94A3B8]" data-testid="no-deposits">No deposits yet.</td></tr>
              )}
              {history.slice(0, visible).map((d) => (
                <tr key={d.id} data-testid={`deposit-row-${d.id}`}>
                  <td className="px-4 py-3 text-[#94A3B8]">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 tabular font-display font-600">{formatNaira(d.amount)}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">
                    {d.gateway === "paynow" ? "PayNow" : (d.reference || "Manual")}
                    {d.checkout_url && d.status === "pending" && (
                      <> · <button onClick={() => { setWaitDep(d); setWaitState("waiting"); }}
                                    className="text-[#0055FF] hover:underline" data-testid={`resume-${d.id}`}>Resume</button></>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right"><StatusPill status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMore shown={Math.min(visible, history.length)} total={history.length} onMore={setVisible} testid="load-more-deposits" />
        </Card>
      </section>

      {/* Waiting-for-payment drawer */}
      <Drawer open={!!waitDep} onOpenChange={(o) => !o && closeWait()}>
        <DrawerContent
          data-testid="waiting-drawer"
          className="bg-[#0B1524] border-t border-[#1A2B44] text-white max-w-lg mx-auto rounded-t-2xl"
        >
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-[#1A2B44]" />
          <DrawerHeader>
            <DrawerTitle className="font-display flex items-center gap-2">
              {waitState === "approved" ? (
                <><CheckCircle2 className="w-5 h-5 text-[#10B981]" /> Payment received</>
              ) : waitState === "rejected" ? (
                <><X className="w-5 h-5 text-[#EF4444]" /> Payment failed</>
              ) : (
                <><Clock className="w-5 h-5 text-[#F59E0B]" /> Waiting for your payment</>
              )}
            </DrawerTitle>
            <DrawerDescription className="text-[#94A3B8]">
              {waitState === "approved"
                ? "Your wallet has been credited."
                : waitState === "rejected"
                ? "PayNow reported this payment as failed or expired."
                : "This screen will update the moment PayNow confirms your transfer."}
            </DrawerDescription>
          </DrawerHeader>

          {waitDep && (
            <div className="px-4 pb-2 space-y-4">
              <Card className="bg-[#020813] border-[#1A2B44] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Amount</div>
                  <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Status</div>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="font-display font-800 text-2xl tabular">{formatNaira(waitDep.amount)}</div>
                  <StatusPill status={waitState === "approved" ? "approved" : waitState === "rejected" ? "rejected" : "pending"} />
                </div>
              </Card>

              {waitState === "waiting" && (
                <>
                  <div className="rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-4 text-xs text-[#94A3B8] flex items-start gap-3">
                    <Loader2 className="w-4 h-4 text-[#0055FF] animate-spin mt-0.5" />
                    <div>
                      Checking every 5s. As soon as PayNow confirms, your wallet updates and this drawer flips to success.
                      If the checkout tab closed, tap <b className="text-white">Open PayNow</b> below.
                    </div>
                  </div>

                  <a
                    href={waitDep.checkout_url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="reopen-checkout"
                    className="block"
                  >
                    <Button className="w-full h-12 bg-[#0055FF] hover:bg-[#3377FF] rounded-xl">
                      <ExternalLink className="w-4 h-4 mr-2" /> Open PayNow checkout
                    </Button>
                  </a>
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
                  <div className="mt-2 text-sm text-[#94A3B8]">Asking PayNow…</div>
                </div>
              )}

              {waitState === "approved" && (
                <div className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 p-6 text-center" data-testid="approved-state">
                  <CheckCircle2 className="w-8 h-8 text-[#10B981] mx-auto" />
                  <div className="mt-3 font-display font-600">Wallet credited</div>
                  <div className="text-xs text-[#94A3B8] mt-1">
                    {formatNaira(waitDep.amount)} is now in your wallet. Go invest 🚀
                  </div>
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

          <DrawerFooter className="pt-3">
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="border-[#1A2B44] bg-transparent text-white h-11 rounded-xl"
                data-testid="waiting-close"
              >
                {waitState === "approved" ? "Done" : "Close"}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

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
