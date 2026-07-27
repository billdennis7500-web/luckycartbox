import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { StatusPill } from "@/pages/user/Deposit";
import { Check, X } from "lucide-react";
import LoadMore from "@/components/LoadMore";

const TABS = ["pending", "approved", "rejected", "all"];

export default function AdminWithdrawals() {
  const [sp, setSp] = useSearchParams();
  const initial = sp.get("status") || "pending";
  const [tab, setTab] = useState(initial);
  const [items, setItems] = useState([]);
  const [visible, setVisible] = useState(15);

  const load = () => {
    const params = tab === "all" ? {} : { status: tab };
    api.get("/admin/withdrawals", { params }).then((r) => { setItems(r.data); setVisible(15); });
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line
  useEffect(() => { setSp(tab === "all" ? {} : { status: tab }); }, [tab]); // eslint-disable-line

  const act = async (w, action) => {
    try {
      await api.post(`/admin/withdrawals/${w.id}/${action}`, { note: "" });
      toast.success(`Withdrawal ${action}d`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-withdrawals-heading">Withdrawals</h1>
        <p className="text-[#94A3B8] mt-2">Approve or reject withdrawal requests. Rejected → auto-refund.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} data-testid={`wd-tab-${t}`}
                  className={`px-4 py-2 rounded-md text-sm border capitalize ${tab === t ? "bg-[#0055FF] text-white border-[#0055FF]" : "border-[#1A2B44] text-[#94A3B8] hover:text-white"}`}>{t}</button>
        ))}
      </div>

      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Bank</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1A2B44]">
            {items.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-[#94A3B8]" data-testid="no-wds">No withdrawals.</td></tr>}
            {items.slice(0, visible).map((w) => (
              <tr key={w.id} data-testid={`admin-wd-${w.id}`}>
                <td className="px-4 py-3 text-[#94A3B8]">{new Date(w.created_at).toLocaleString()}</td>
                <td className="px-4 py-3"><div>{w.user_name}</div><div className="text-xs text-[#94A3B8]">{w.user_phone}</div></td>
                <td className="px-4 py-3 tabular font-display font-600">{formatNaira(w.amount)}</td>
                <td className="px-4 py-3">
                  <div>{w.bank_name}</div>
                  <div className="text-xs text-[#94A3B8]">{w.account_name} · {w.account_number}</div>
                </td>
                <td className="px-4 py-3"><StatusPill status={w.status} /></td>
                <td className="px-4 py-3 text-right">
                  {w.status === "pending" ? (
                    <div className="inline-flex gap-2">
                      <Button size="sm" onClick={() => act(w, "approve")} data-testid={`approve-wd-${w.id}`}
                              className="bg-[#10B981] hover:bg-[#0ea770]"><Check className="w-3 h-3 mr-1"/>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => act(w, "reject")} data-testid={`reject-wd-${w.id}`}
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
        <LoadMore shown={Math.min(visible, items.length)} total={items.length} onMore={setVisible} step={15} testid="load-more-admin-withdrawals" />
      </Card>
    </div>
  );
}
