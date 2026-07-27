import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { StatusPill } from "@/pages/user/Deposit";
import {
  Check, X, RefreshCw, Zap, Search, Landmark, ChevronDown, ChevronUp,
  Copy, ExternalLink, Filter,
} from "lucide-react";
import LoadMore from "@/components/LoadMore";

const TABS = ["pending", "approved", "rejected", "all"];
const METHODS = [
  { k: "all",    label: "All methods" },
  { k: "paynow", label: "PayNow (auto)" },
  { k: "manual", label: "Manual bank" },
];

function methodLabel(d) {
  if (d.gateway === "paynow") return "PayNow (auto)";
  if (d.payment_account_bank) return `${d.payment_account_bank} · ${d.payment_account_number}`;
  return "Manual bank";
}

function copyText(v) {
  if (!v) return;
  navigator.clipboard.writeText(String(v));
  toast.success("Copied");
}

export default function AdminDeposits() {
  const [sp, setSp] = useSearchParams();
  const initial = sp.get("status") || "pending";
  const [tab, setTab] = useState(initial);
  const [methodFilter, setMethodFilter] = useState("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [visible, setVisible] = useState(15);
  const [expanded, setExpanded] = useState({});

  const load = () => {
    const params = tab === "all" ? {} : { status: tab };
    api.get("/admin/deposits", { params }).then((r) => { setItems(r.data); setVisible(15); });
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line
  useEffect(() => { setSp(tab === "all" ? {} : { status: tab }); }, [tab]); // eslint-disable-line

  const filtered = useMemo(() => {
    let out = items;
    if (methodFilter === "paynow") out = out.filter((d) => d.gateway === "paynow");
    else if (methodFilter === "manual") out = out.filter((d) => d.gateway !== "paynow");
    if (q) {
      const qq = q.toLowerCase();
      out = out.filter((d) =>
        (d.user_name || "").toLowerCase().includes(qq) ||
        (d.user_phone || "").toLowerCase().includes(qq) ||
        (d.reference || "").toLowerCase().includes(qq) ||
        (d.merchant_order_no || "").toLowerCase().includes(qq) ||
        (d.platform_order_no || "").toLowerCase().includes(qq) ||
        (d.payment_account_number || "").toLowerCase().includes(qq)
      );
    }
    return out;
  }, [items, q, methodFilter]);

  const stats = useMemo(() => {
    const pendingSum = filtered.filter((d) => d.status === "pending").reduce((s, d) => s + (d.amount || 0), 0);
    const approvedSum = filtered.filter((d) => d.status === "approved").reduce((s, d) => s + (d.amount || 0), 0);
    return { pendingSum, approvedSum, total: filtered.length };
  }, [filtered]);

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
      if (data.ok) toast.success(`Verified & credited ₦${Number(data.amount).toLocaleString()}`);
      else toast.info(data.message || `PayNow status: ${data.paynow_status}`);
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

  const toggle = (id) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-deposits-heading">Deposits</h1>
          <p className="text-[#94A3B8] mt-2">Approve or reject user-submitted deposits. See each user's chosen payment method at a glance.</p>
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

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Pending value</div>
          <div className="mt-1 font-display font-800 text-xl tabular text-[#F59E0B]" data-testid="dep-pending-sum">{formatNaira(stats.pendingSum)}</div>
        </Card>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Approved value</div>
          <div className="mt-1 font-display font-800 text-xl tabular text-[#10B981]" data-testid="dep-approved-sum">{formatNaira(stats.approvedSum)}</div>
        </Card>
        <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Rows</div>
          <div className="mt-1 font-display font-800 text-xl tabular" data-testid="dep-row-count">{stats.total}</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-md border border-[#1A2B44] px-2 h-9 text-xs text-[#94A3B8]">
            <Filter className="w-3 h-3" /> Method
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              data-testid="deposit-method-filter"
              className="bg-transparent focus:outline-none text-white ml-1"
            >
              {METHODS.map((m) => <option key={m.k} value={m.k} className="bg-[#0B1524]">{m.label}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-[#94A3B8]" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, phone, ref…"
              data-testid="deposit-search-input"
              className="pl-8 h-9 bg-[#121E30] border-[#1A2B44] text-white w-56"
            />
          </div>
        </div>
      </div>

      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
            <tr>
              <th className="px-4 py-3 w-4"></th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1A2B44]">
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-[#94A3B8]" data-testid="no-deposits-admin">No deposits match your filters.</td></tr>
            )}
            {filtered.slice(0, visible).map((d) => (
              <React.Fragment key={d.id}>
                <tr data-testid={`admin-deposit-${d.id}`} className="align-top">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggle(d.id)}
                      data-testid={`expand-dep-${d.id}`}
                      className="w-6 h-6 rounded border border-[#1A2B44] grid place-items-center text-[#94A3B8] hover:text-white"
                      aria-label="Expand row"
                    >
                      {expanded[d.id] ? <ChevronUp className="w-3 h-3"/> : <ChevronDown className="w-3 h-3"/>}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div>{d.user_name}</div>
                    <div className="text-xs text-[#94A3B8] tabular">{d.user_phone}</div>
                  </td>
                  <td className="px-4 py-3 tabular font-display font-600">{formatNaira(d.amount)}</td>
                  <td className="px-4 py-3">
                    {d.gateway === "paynow" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#0055FF]/40 bg-[#0055FF]/10 text-[#0055FF] text-xs">
                        <Zap className="w-3 h-3" /> PayNow
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#1A2B44] bg-[#121E30] text-xs">
                        <Landmark className="w-3 h-3 text-[#94A3B8]" /> Manual
                      </span>
                    )}
                    {d.payment_account_bank && (
                      <div className="mt-1 text-[10px] text-[#94A3B8] tabular truncate max-w-[180px]" title={`${d.payment_account_bank} · ${d.payment_account_number}`}>
                        {d.payment_account_bank} · {d.payment_account_number}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#94A3B8] max-w-[160px] truncate" title={d.reference || d.merchant_order_no || ""}>
                    {d.reference || d.merchant_order_no || "—"}
                  </td>
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
                {expanded[d.id] && (
                  <tr className="bg-[#020813]/70" data-testid={`admin-deposit-detail-${d.id}`}>
                    <td colSpan={8} className="px-6 py-4">
                      <div className="grid md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Deposit</div>
                          <Kv k="ID" v={d.id} copyable />
                          <Kv k="Gateway" v={d.gateway} />
                          <Kv k="Method (raw)" v={d.method} />
                          {d.reference && <Kv k="User reference" v={d.reference} copyable />}
                          <Kv k="Created" v={new Date(d.created_at).toLocaleString()} />
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">Payment target</div>
                          {d.gateway === "paynow" ? (
                            <>
                              <Kv k="Merchant order" v={d.merchant_order_no} copyable />
                              <Kv k="PayNow order"   v={d.platform_order_no} copyable />
                              {d.checkout_url && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[#94A3B8] w-32 shrink-0">Checkout URL</span>
                                  <a href={d.checkout_url} target="_blank" rel="noreferrer"
                                     data-testid={`open-checkout-${d.id}`}
                                     className="inline-flex items-center gap-1 text-[#0055FF] hover:underline">
                                    Open <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              )}
                              {d.gateway_error && <Kv k="Gateway error" v={d.gateway_error} />}
                            </>
                          ) : (
                            <>
                              <Kv k="Bank"     v={d.payment_account_bank || "—"} />
                              <Kv k="Account #" v={d.payment_account_number || "—"} copyable />
                              <Kv k="Account name" v={d.payment_account_name || "—"} />
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <LoadMore shown={Math.min(visible, filtered.length)} total={filtered.length} onMore={setVisible} step={15} testid="load-more-admin-deposits" />
      </Card>
    </div>
  );
}

function Kv({ k, v, copyable }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[#94A3B8] w-32 shrink-0">{k}</span>
      <span className="text-white tabular flex-1 break-all">{v || "—"}</span>
      {copyable && v && (
        <button onClick={() => copyText(v)} className="text-[#94A3B8] hover:text-white shrink-0" aria-label="Copy">
          <Copy className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
