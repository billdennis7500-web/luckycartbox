import React, { useEffect, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Banknote, Zap, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function Deposit() {
  const [accounts, setAccounts] = useState([]);
  const [history, setHistory] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [paynowEnabled, setPaynowEnabled] = useState(false);
  const [lastPaynow, setLastPaynow] = useState(null);

  const load = () => {
    api.get("/payment-accounts").then((r) => setAccounts(r.data));
    api.get("/deposits").then((r) => setHistory(r.data));
    api.get("/paynow/banks").then((r) => setPaynowEnabled(!!r.data?.enabled)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!method) { toast.error("Choose a payment option"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/deposits", { amount: Number(amount), method, reference });
      if (data.gateway === "paynow" && data.checkout_url) {
        setLastPaynow(data);
        toast.success("Redirecting to PayNow…");
        window.open(data.checkout_url, "_blank", "noopener,noreferrer");
      } else {
        toast.success("Deposit submitted. Admin will approve shortly.");
      }
      setAmount(""); setReference("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  const selectedAccount = accounts.find((a) => a.id === method);
  const isPaynow = method === "paynow-auto";
  const copy = (val) => { navigator.clipboard.writeText(val); toast.success("Copied"); };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="deposit-heading">Deposit funds</h1>
        <p className="text-[#94A3B8] mt-2">Pay instantly via PayNow or transfer manually and log the deposit.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl">
          <h2 className="font-display text-lg font-600 mb-4">New deposit</h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger data-testid="deposit-account-select" className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11">
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
                    You'll be redirected to PayNow to complete payment. Your wallet is credited automatically once the transfer is confirmed.
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
                     className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
            </div>
            {!isPaynow && (
              <div>
                <Label>Transaction reference <span className="text-[#94A3B8]">(optional)</span></Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)}
                       data-testid="deposit-reference-input"
                       className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
              </div>
            )}
            <Button type="submit" disabled={loading} data-testid="deposit-submit-button"
                    className="w-full h-11 bg-[#0055FF] hover:bg-[#3377FF] rounded-md glow-primary">
              {loading ? "Processing…" : (isPaynow ? "Pay with PayNow" : "Submit for approval")}
            </Button>
          </form>
        </Card>

        <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl">
          <h2 className="font-display text-lg font-600 mb-4">How it works</h2>
          <ol className="space-y-3 text-sm text-[#94A3B8]">
            <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-[#0055FF]/20 text-[#0055FF] grid place-items-center font-display font-600 text-xs">1</span> Choose PayNow (instant) or a manual bank account.</li>
            <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-[#0055FF]/20 text-[#0055FF] grid place-items-center font-display font-600 text-xs">2</span> Enter the amount and confirm.</li>
            <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-[#0055FF]/20 text-[#0055FF] grid place-items-center font-display font-600 text-xs">3</span> Pay via the PayNow checkout — or transfer manually and log the reference.</li>
            <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-[#0055FF]/20 text-[#0055FF] grid place-items-center font-display font-600 text-xs">4</span> Wallet is credited automatically (PayNow) or after admin approval (manual).</li>
          </ol>
          {lastPaynow?.checkout_url && (
            <div className="mt-6 p-4 rounded-lg border border-[#0055FF]/40 bg-[#0055FF]/10 text-sm space-y-2">
              <div className="font-display font-600">Last PayNow session</div>
              <a href={lastPaynow.checkout_url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-[#0055FF] hover:underline break-all"
                 data-testid="paynow-reopen-link">
                <ExternalLink className="w-3 h-3" /> Re-open checkout
              </a>
            </div>
          )}
          <div className="mt-6 p-4 rounded-lg border border-[#1A2B44] text-xs text-[#94A3B8] flex gap-2">
            <Banknote className="w-4 h-4 mt-0.5 text-[#0055FF]" /> Wallet credit is triggered by PayNow webhook. Refresh your dashboard after payment.
          </div>
        </Card>
      </div>

      <section>
        <h2 className="font-display text-xl font-600 mb-3">Deposit history</h2>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-[#1A2B44]">
              {history.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-[#94A3B8]" data-testid="no-deposits">No deposits yet.</td></tr>
              )}
              {history.map((d) => (
                <tr key={d.id} data-testid={`deposit-row-${d.id}`}>
                  <td className="px-4 py-3 text-[#94A3B8]">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 tabular font-display font-600">{formatNaira(d.amount)}</td>
                  <td className="px-4 py-3 text-[#94A3B8]">
                    {d.gateway === "paynow" ? "PayNow" : (d.reference || "Manual")}
                    {d.checkout_url && d.status === "pending" && (
                      <> · <a href={d.checkout_url} target="_blank" rel="noreferrer" className="text-[#0055FF] hover:underline">Pay</a></>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
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
