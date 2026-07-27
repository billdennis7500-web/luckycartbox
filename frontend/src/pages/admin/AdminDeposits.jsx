import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { StatusPill } from "@/pages/user/Deposit";
import { Check, X, RefreshCw, Zap } from "lucide-react";
import LoadMore from "@/components/LoadMore";

const TABS = ["pending", "approved", "rejected", "all"];

export default function AdminDeposits() {
  const [sp, setSp] = useSearchParams();
  const initial = sp.get("status") || "pending";
  const [tab, setTab] = useState(initial);
  const [items, setItems] = useState([]);
  const [visible, setVisible] = useState(15);

  const load = () => {
    const params = tab === "all" ? {} : { status: tab };
    api.get("/admin/deposits", { params }).then((r) => { setItems(r.data); setVisible(15); });
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line
  useEffect(() => { setSp(tab === "all" ? {} : { status: tab }); }, [tab]); // eslint-disable-line

  const act = async (d, action) => {
    try {
      await api.post(`/admin/deposits/${d.id}/${action}`, { note: "" });
      toast.success(`Deposit ${action}d`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const verify = async (d) => {
    try {
      const { data } = await api.post(`/admin/deposits/${d.id}/verify`);
      if (data.ok) {
        toast.success(`Verified & credited ₦${Number(data.amount).toLocaleString()}`);
      } else {
        toast.info(data.message || `PayNow status: ${data.paynow_status}`);
      }
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Verify failed");
    }
  };

  const reconcileAll = async () => {
    try {
      const { data } = await api.post("/admin/paynow/reconcile");
      toast.success(`Reconciled: ${data.deposits_credited} deposit(s), ${data.withdrawals_settled} withdrawal(s)`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Reconcile failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-deposits-heading">Deposits</h1>
          <p className="text-[#94A3B8] mt-2">Approve or reject user-submitted deposits.</p>
        </div>
        <Button
          onClick={reconcileAll}
          data-testid="reconcile-paynow-btn"
          variant="outline"
          className="border-[#0055FF]/40 bg-transparent text-[#0055FF] hover:bg-[#0055FF]/10"
        >
          <RefreshCw className="w-3 h-3 mr-1" /> Reconcile PayNow
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`deposit-tab-${t}`}
            className={`px-4 py-2 rounded-md text-sm border capitalize ${
              tab === t ? "bg-[#0055FF] text-white border-[#0055FF]" : "border-[#1A2B44] text-[#94A3B8] hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1A2B44]">
            {items.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-[#94A3B8]" data-testid="no-deposits-admin">No deposits.</td></tr>}
            {items.map((d) => (
              <tr key={d.id} data-testid={`admin-deposit-${d.id}`}>
                <td className="px-4 py-3 text-[#94A3B8]">{new Date(d.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div>{d.user_name}</div>
                  <div className="text-xs text-[#94A3B8]">{d.user_phone}</div>
                </td>
                <td className="px-4 py-3 tabular font-display font-600">{formatNaira(d.amount)}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{d.reference || "—"}</td>
                <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                <td className="px-4 py-3 text-right">
                  {d.status === "pending" ? (
                    <div className="inline-flex gap-2 flex-wrap justify-end">
                      {d.gateway === "paynow" && (
                        <Button size="sm" variant="outline" onClick={() => verify(d)} data-testid={`verify-dep-${d.id}`}
                                className="border-[#0055FF]/40 bg-transparent text-[#0055FF] hover:bg-[#0055FF]/10">
                          <Zap className="w-3 h-3 mr-1"/>Verify
                        </Button>
                      )}
                      <Button size="sm" onClick={() => act(d, "approve")} data-testid={`approve-dep-${d.id}`}
                              className="bg-[#10B981] hover:bg-[#0ea770]"><Check className="w-3 h-3 mr-1"/>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => act(d, "reject")} data-testid={`reject-dep-${d.id}`}
                              className="border-[#EF4444]/40 bg-transparent text-[#EF4444] hover:bg-[#EF4444]/10"><X className="w-3 h-3 mr-1"/>Reject</Button>
                    </div>
                  ) : (
                    <span className="text-xs text-[#94A3B8]">Processed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <LoadMore shown={Math.min(visible, items.length)} total={items.length} onMore={setVisible} step={15} testid="load-more-admin-deposits" />
      </Card>
    </div>
  );
}
