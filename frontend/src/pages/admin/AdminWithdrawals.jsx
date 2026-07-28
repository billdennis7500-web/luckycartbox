import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { StatusPill } from "@/pages/user/Deposit";
import { Check, X, CheckCheck, Loader2, ShieldCheck, Zap } from "lucide-react";
import LoadMore from "@/components/LoadMore";

const TABS = ["pending", "approved", "rejected", "all"];

export default function AdminWithdrawals() {
  const [sp, setSp] = useSearchParams();
  const initial = sp.get("status") || "pending";
  const [tab, setTab] = useState(initial);
  const [items, setItems] = useState([]);
  const [visible, setVisible] = useState(15);
  const [selected, setSelected] = useState(new Set());
  const [batchLimit, setBatchLimit] = useState(50);
  const [autoPayout, setAutoPayout] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [payoutGateways, setPayoutGateways] = useState({ paynow: false, shpay: false, onesspay: false });

  const load = () => {
    const params = tab === "all" ? {} : { status: tab };
    api.get("/admin/withdrawals", { params }).then((r) => { setItems(r.data); setVisible(15); setSelected(new Set()); });
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line
  useEffect(() => { setSp(tab === "all" ? {} : { status: tab }); }, [tab]); // eslint-disable-line
  useEffect(() => {
    api.get("/settings/public")
      .then((r) => {
        setBatchLimit(Number(r.data?.batch_approve_limit) || 50);
        setAutoPayout(!!r.data?.auto_payout_enabled);
      })
      .catch(() => {});
    // Also fetch admin settings for the accurate batch limit
    api.get("/admin/settings")
      .then((r) => setBatchLimit(Number(r.data?.batch_approve_limit) || 50))
      .catch(() => {});
    // Which payout gateways are currently enabled by admin toggles?
    api.get("/admin/gateways")
      .then((r) => {
        const out = { paynow: false, shpay: false, onesspay: false };
        (r.data?.gateways || []).forEach((g) => {
          if (g.key in out) out[g.key] = !!(g.configured && g.payout);
        });
        setPayoutGateways(out);
      })
      .catch(() => {});
  }, []);

  const pendingRows = useMemo(() => items.filter((w) => w.status === "pending"), [items]);
  const pendingSum = useMemo(() => pendingRows.reduce((s, w) => s + (w.amount || 0), 0), [pendingRows]);
  const feesSum = useMemo(() => items.reduce((s, w) => s + (w.fee || 0), 0), [items]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = pendingRows.slice(0, visible).map((w) => w.id);
    const allSelected = visibleIds.every((id) => selected.has(id));
    setSelected(new Set(allSelected ? [] : visibleIds.slice(0, batchLimit)));
  };

  const act = async (w, action) => {
    try {
      await api.post(`/admin/withdrawals/${w.id}/${action}`, { note: "" });
      toast.success(`Withdrawal ${action}d`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const payoutVia = async (w, gateway) => {
    const label = { paynow: "PayNow", shpay: "SHPAY", onesspay: "1SSPay" }[gateway] || gateway;
    try {
      await api.post(`/admin/withdrawals/${w.id}/${gateway}-payout`, { note: "" });
      toast.success(`${label} payout dispatched`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || `${label} payout failed`);
    }
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    if (selected.size > batchLimit) return toast.error(`Batch too large. Limit: ${batchLimit}.`);
    if (!window.confirm(`Approve ${selected.size} withdrawal${selected.size === 1 ? "" : "s"}?`)) return;
    setBulkLoading(true);
    try {
      const { data } = await api.post("/admin/withdrawals/bulk-approve", { ids: Array.from(selected) });
      const parts = [];
      if (data.approved) parts.push(`${data.approved} approved`);
      if (data.processing) parts.push(`${data.processing} sent to gateway`);
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      toast.success(parts.join(" · ") || "Done");
      if (data.errors?.length) {
        console.warn("bulk approve errors", data.errors);
      }
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBulkLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-withdrawals-heading">Withdrawals</h1>
          <p className="text-[var(--nb-muted)] mt-2">Approve one-by-one or in bulk. Rejected → auto-refund.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border ${
            autoPayout
              ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
              : "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30"
          }`} data-testid="wd-auto-payout-chip">
            {autoPayout ? <><Zap className="w-3 h-3"/> Auto-payout ON</> : <><ShieldCheck className="w-3 h-3"/> Manual approval</>}
          </span>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Pending value</div>
          <div className="mt-1 font-display font-800 text-xl tabular text-[#F59E0B]" data-testid="wd-pending-sum">{formatNaira(pendingSum)}</div>
          <div className="text-[10px] text-[var(--nb-muted)] mt-1 tabular">{pendingRows.length} pending</div>
        </Card>
        <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Fees collected (shown)</div>
          <div className="mt-1 font-display font-800 text-xl tabular text-[#0055FF]" data-testid="wd-fees-sum">{formatNaira(feesSum)}</div>
        </Card>
        <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Bulk approve limit</div>
          <div className="mt-1 font-display font-800 text-xl tabular text-white" data-testid="wd-batch-limit">{batchLimit}</div>
          <div className="text-[10px] text-[var(--nb-muted)] mt-1">Configurable in Settings</div>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} data-testid={`wd-tab-${t}`}
                    className={`px-4 py-2 rounded-md text-sm border capitalize ${tab === t ? "bg-[#0055FF] text-white border-[#0055FF]" : "border-[var(--nb-border)] text-[var(--nb-muted)] hover:text-white"}`}>{t}</button>
          ))}
        </div>

        {tab === "pending" && selected.size > 0 && (
          <Button
            onClick={bulkApprove}
            disabled={bulkLoading}
            data-testid="bulk-approve-btn"
            className="bg-[#10B981] hover:bg-[#0ea770]"
          >
            {bulkLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : <CheckCheck className="w-3 h-3 mr-1"/>}
            Approve {selected.size} selected
          </Button>
        )}
      </div>

      <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[var(--nb-muted)] bg-[var(--nb-card2)]">
            <tr>
              {tab === "pending" && (
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={pendingRows.length > 0 && pendingRows.slice(0, visible).every((w) => selected.has(w.id))}
                    onChange={toggleAllVisible}
                    data-testid="wd-select-all"
                    className="w-4 h-4 accent-[#0055FF]"
                    aria-label="Select all visible pending"
                  />
                </th>
              )}
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Fee → Payout</th>
              <th className="px-4 py-3">Bank</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--nb-border)]">
            {items.length === 0 && (
              <tr><td colSpan={tab === "pending" ? 8 : 7} className="text-center py-8 text-[var(--nb-muted)]" data-testid="no-wds">No withdrawals.</td></tr>
            )}
            {items.slice(0, visible).map((w) => {
              const payout = Number(w.payout_amount ?? w.amount ?? 0);
              const fee = Number(w.fee ?? 0);
              return (
                <tr key={w.id} data-testid={`admin-wd-${w.id}`}>
                  {tab === "pending" && (
                    <td className="px-3 py-3">
                      {w.status === "pending" && (
                        <input
                          type="checkbox"
                          checked={selected.has(w.id)}
                          onChange={() => toggle(w.id)}
                          data-testid={`wd-select-${w.id}`}
                          className="w-4 h-4 accent-[#0055FF]"
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-[var(--nb-muted)] whitespace-nowrap">{new Date(w.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3"><div>{w.user_name}</div><div className="text-xs text-[var(--nb-muted)] tabular">{w.user_phone}</div></td>
                  <td className="px-4 py-3 tabular font-display font-600">{formatNaira(w.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="text-[10px] text-[var(--nb-muted)]">Fee {formatNaira(fee)}</div>
                    <div className="tabular font-display font-600 text-[#10B981]">{formatNaira(payout)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{w.bank_name}</div>
                    <div className="text-xs text-[var(--nb-muted)] tabular">{w.account_name} · {w.account_number}</div>
                  </td>
                  <td className="px-4 py-3"><StatusPill status={w.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {w.status === "pending" ? (
                      <div className="inline-flex flex-wrap gap-1.5 justify-end">
                        {/* Default Approve — routes via PayNow when paynow payout is enabled */}
                        <Button size="sm" onClick={() => act(w, "approve")} data-testid={`approve-wd-${w.id}`}
                                className="bg-[#10B981] hover:bg-[#0ea770] h-8 px-2.5 text-xs"><Check className="w-3 h-3 mr-1"/>Approve</Button>
                        {/* Explicit gateway routing chips — only show if that gateway's payout is enabled */}
                        {payoutGateways.shpay && (
                          <Button size="sm" variant="outline" onClick={() => payoutVia(w, "shpay")}
                                  data-testid={`shpay-payout-wd-${w.id}`}
                                  className="border-[#8B5CF6]/40 bg-transparent text-[#8B5CF6] hover:bg-[#8B5CF6]/10 h-8 px-2.5 text-xs">
                            SHPAY
                          </Button>
                        )}
                        {payoutGateways.onesspay && (
                          <Button size="sm" variant="outline" onClick={() => payoutVia(w, "onesspay")}
                                  data-testid={`onesspay-payout-wd-${w.id}`}
                                  className="border-[#F97316]/40 bg-transparent text-[#F97316] hover:bg-[#F97316]/10 h-8 px-2.5 text-xs">
                            1SSPay
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => act(w, "reject")} data-testid={`reject-wd-${w.id}`}
                                className="border-[#EF4444]/40 bg-transparent text-[#EF4444] hover:bg-[#EF4444]/10 h-8 px-2.5 text-xs"><X className="w-3 h-3 mr-1"/>Reject</Button>
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--nb-muted)]">Processed</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <LoadMore shown={Math.min(visible, items.length)} total={items.length} onMore={setVisible} step={15} testid="load-more-admin-withdrawals" />
      </Card>
    </div>
  );
}
