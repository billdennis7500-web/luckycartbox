import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Zap, Landmark, Receipt } from "lucide-react";
import LoadMore from "@/components/LoadMore";
import { StatusPill } from "@/pages/user/Deposit";

const TABS = [
  { k: "all", label: "All" },
  { k: "pending", label: "Pending" },
  { k: "approved", label: "Approved" },
  { k: "rejected", label: "Rejected" },
];

function MethodLabel({ d }) {
  if (d.gateway === "paynow") {
    return (
      <span className="inline-flex items-center gap-1 text-[#0055FF]">
        <Zap className="w-3 h-3" /> Instant Pay
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[#94A3B8]">
      <Landmark className="w-3 h-3" />
      {d.payment_account_bank || d.reference || "Manual"}
    </span>
  );
}

export default function DepositHistory() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(10);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/deposits")
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setVisible(10); }, [tab, q]);

  const filtered = useMemo(() => {
    let out = items;
    if (tab !== "all") out = out.filter((d) => d.status === tab);
    if (q) {
      const qq = q.toLowerCase();
      out = out.filter((d) =>
        (d.reference || "").toLowerCase().includes(qq) ||
        (d.payment_account_bank || "").toLowerCase().includes(qq) ||
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

  return (
    <div className="space-y-6" data-testid="deposit-history-page">
      <div className="flex items-center gap-3">
        <Link to="/deposit" data-testid="hist-back-link"
              className="w-9 h-9 rounded-lg border border-[#1A2B44] grid place-items-center text-[#94A3B8] hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="hist-heading">Deposit history</h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Every deposit you've submitted, oldest to newest.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-2 p-1 rounded-xl bg-[#0B1524] border border-[#1A2B44]">
        {TABS.map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={`hist-tab-${k}`}
            className={`h-9 text-xs rounded-lg font-medium transition-colors ${
              tab === k ? "bg-[#0055FF] text-white" : "text-[#94A3B8] hover:text-white"
            }`}
          >
            {label} <span className="opacity-60 tabular">({counts[k]})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3.5 text-[#94A3B8]" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bank, reference or amount"
               data-testid="hist-search-input"
               className="pl-9 bg-[#121E30] border-[#1A2B44] text-white h-11" />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-[#1A2B44] p-8 text-center text-sm text-[#94A3B8]" data-testid="hist-loading">
          Loading history…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1A2B44] p-8 text-center space-y-2" data-testid="hist-empty">
          <Receipt className="w-6 h-6 text-[#0055FF] mx-auto" />
          <div className="text-sm text-[#94A3B8]">
            {tab === "all" ? "You haven't made any deposits yet." : `No ${tab} deposits.`}
          </div>
          <Link to="/deposit" className="inline-block text-xs text-[#0055FF] hover:underline">Make a deposit →</Link>
        </div>
      ) : (
        <>
          <div className="text-[10px] text-[#94A3B8] tabular flex items-center justify-between" data-testid="hist-counter">
            <span>Showing {Math.min(visible, filtered.length)} of {filtered.length}</span>
            <span>{tab === "all" ? "all statuses" : tab}</span>
          </div>
          <div className="grid gap-3" data-testid="hist-list">
            {filtered.slice(0, visible).map((d) => (
              <Card key={d.id} className="bg-[#0B1524] border-[#1A2B44] rounded-2xl p-4" data-testid={`hist-row-${d.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display font-700 tabular text-lg">{formatNaira(d.amount)}</div>
                    <div className="text-xs text-[#94A3B8] mt-0.5">
                      <MethodLabel d={d} />
                    </div>
                  </div>
                  <StatusPill status={d.status} />
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[#94A3B8] tabular">
                  <span>{new Date(d.created_at).toLocaleString()}</span>
                  {d.reference && <span className="truncate max-w-[45%]" title={d.reference}>Ref: {d.reference}</span>}
                </div>
              </Card>
            ))}
          </div>
          <LoadMore
            shown={Math.min(visible, filtered.length)}
            total={filtered.length}
            onMore={setVisible}
            step={10}
            testid="hist-load-more"
          />
        </>
      )}
    </div>
  );
}
