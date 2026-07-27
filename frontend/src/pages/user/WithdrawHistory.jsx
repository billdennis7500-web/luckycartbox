import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Receipt, ArrowUpFromLine, Clock, CheckCircle2, XCircle, Landmark } from "lucide-react";
import LoadMore from "@/components/LoadMore";

const TABS = [
  { k: "all", label: "All" },
  { k: "pending", label: "Pending" },
  { k: "approved", label: "Approved" },
  { k: "rejected", label: "Rejected" },
];

function StatusBadge({ status }) {
  const map = {
    pending:   { icon: Clock,         bg: "bg-[#F59E0B]/15", fg: "text-[#F59E0B]", ring: "border-[#F59E0B]/30" },
    processing:{ icon: Clock,         bg: "bg-[#0055FF]/15", fg: "text-[#0055FF]", ring: "border-[#0055FF]/30" },
    approved:  { icon: CheckCircle2,  bg: "bg-[#10B981]/15", fg: "text-[#10B981]", ring: "border-[#10B981]/30" },
    rejected:  { icon: XCircle,       bg: "bg-[#EF4444]/15", fg: "text-[#EF4444]", ring: "border-[#EF4444]/30" },
    failed:    { icon: XCircle,       bg: "bg-[#EF4444]/15", fg: "text-[#EF4444]", ring: "border-[#EF4444]/30" },
  };
  const cfg = map[status] || map.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border ${cfg.bg} ${cfg.fg} ${cfg.ring}`}>
      <Icon className="w-3 h-3" />
      <span className="capitalize">{status}</span>
    </span>
  );
}

function accent(dateStr = "") {
  const palette = ["#0055FF", "#10B981", "#F59E0B", "#8B5CF6", "#EB1C24", "#0A6EBD"];
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

export default function WithdrawHistory() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(10);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/withdrawals").then((r) => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { setVisible(10); }, [tab, q]);

  const filtered = useMemo(() => {
    let out = items;
    if (tab !== "all") out = out.filter((d) => d.status === tab);
    if (q) {
      const qq = q.toLowerCase();
      out = out.filter((d) =>
        (d.bank_name || "").toLowerCase().includes(qq) ||
        (d.account_number || "").toLowerCase().includes(qq) ||
        String(d.amount || "").includes(qq)
      );
    }
    return out;
  }, [items, tab, q]);

  const counts = useMemo(() => ({
    all: items.length,
    pending: items.filter((d) => d.status === "pending").length,
    approved: items.filter((d) => d.status === "approved").length,
    rejected: items.filter((d) => d.status === "rejected").length,
  }), [items]);

  const totalApproved = items.filter((d) => d.status === "approved").reduce((s, d) => s + (d.amount || 0), 0);

  return (
    <div className="space-y-5" data-testid="withdraw-history-page">
      <div className="flex items-center gap-3">
        <Link to="/withdraw" data-testid="whist-back-link"
              className="w-9 h-9 rounded-lg border border-[#1A2B44] grid place-items-center text-[#94A3B8] hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="whist-heading">Withdrawal history</h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            {items.length} withdrawal{items.length === 1 ? "" : "s"} · <span className="text-[#10B981] tabular">{formatNaira(totalApproved)}</span> paid out
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 p-1 rounded-xl bg-[#0B1524] border border-[#1A2B44]">
        {TABS.map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={`whist-tab-${k}`}
            className={`h-9 text-xs rounded-lg font-medium transition-colors ${
              tab === k ? "bg-[#0055FF] text-white" : "text-[#94A3B8] hover:text-white"
            }`}
          >
            {label} <span className="opacity-60 tabular">({counts[k]})</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3.5 text-[#94A3B8]" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bank, account or amount"
               data-testid="whist-search-input"
               className="pl-9 bg-[#121E30] border-[#1A2B44] text-white h-11" />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-[#1A2B44] p-8 text-center text-sm text-[#94A3B8]" data-testid="whist-loading">
          Loading history…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1A2B44] p-8 text-center space-y-2" data-testid="whist-empty">
          <Receipt className="w-6 h-6 text-[#0055FF] mx-auto" />
          <div className="text-sm text-[#94A3B8]">
            {tab === "all" ? "You haven't requested any withdrawals yet." : `No ${tab} withdrawals.`}
          </div>
          <Link to="/withdraw" className="inline-block text-xs text-[#0055FF] hover:underline">Request a withdrawal →</Link>
        </div>
      ) : (
        <>
          <div className="text-[10px] text-[#94A3B8] tabular flex items-center justify-between" data-testid="whist-counter">
            <span>Showing {Math.min(visible, filtered.length)} of {filtered.length}</span>
            <span>{tab === "all" ? "all statuses" : tab}</span>
          </div>

          <div className="grid gap-3" data-testid="whist-list">
            {filtered.slice(0, visible).map((w) => {
              const c = accent(w.id || w.created_at || "");
              const dt = new Date(w.created_at);
              return (
                <div
                  key={w.id}
                  data-testid={`whist-row-${w.id}`}
                  className="relative overflow-hidden rounded-2xl border border-[#1A2B44] bg-[#0B1524] p-4 group hover:border-[#0055FF]/40 transition-colors"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(180deg, ${c}, ${c}55)` }} />
                  <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl pointer-events-none" style={{ background: c }} />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
                        style={{ background: `${c}20`, border: `1px solid ${c}55` }}
                      >
                        <ArrowUpFromLine className="w-4 h-4" style={{ color: c }} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display font-800 tabular text-lg leading-tight">{formatNaira(w.amount)}</div>
                        <div className="mt-1 text-[11px] text-[#94A3B8] truncate flex items-center gap-1">
                          <Landmark className="w-3 h-3 text-[#94A3B8]" /> {w.bank_name}
                        </div>
                        <div className="text-[10px] text-[#94A3B8] tabular truncate">{w.account_number}</div>
                      </div>
                    </div>
                    <StatusBadge status={w.status} />
                  </div>

                  <div className="relative mt-3 pt-3 border-t border-[#1A2B44] flex items-center justify-between text-[10px] text-[#94A3B8] tabular">
                    <span>{dt.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="truncate max-w-[50%]" title={w.account_name}>{w.account_name}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <LoadMore
            shown={Math.min(visible, filtered.length)}
            total={filtered.length}
            onMore={setVisible}
            step={10}
            testid="whist-load-more"
          />
        </>
      )}
    </div>
  );
}
