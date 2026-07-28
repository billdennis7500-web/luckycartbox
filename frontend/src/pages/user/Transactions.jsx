import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Search, History, ArrowDownRight, ArrowUpRight, Sparkles,
  Gift, Ticket, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Wallet, ShieldCheck,
} from "lucide-react";
import LoadMore from "@/components/LoadMore";
import { SectionHeader } from "@/components/design";

const TABS = [
  { k: "all",     label: "All" },
  { k: "credits", label: "Credits" },
  { k: "debits",  label: "Debits" },
];

/* Deterministic accent color per row */
function accent(id = "") {
  const palette = ["#0055FF", "#10B981", "#F59E0B", "#8B5CF6", "#EB1C24", "#0A6EBD"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

/* Type → icon + user-friendly label */
function typeMeta(t = "") {
  const key = (t || "").toLowerCase();
  const map = {
    deposit:              { icon: ArrowDownToLine, label: "Deposit" },
    withdrawal:           { icon: ArrowUpFromLine, label: "Withdrawal" },
    withdrawal_hold:      { icon: ArrowUpFromLine, label: "Withdrawal hold" },
    withdrawal_refund:    { icon: ArrowDownToLine, label: "Withdrawal refund" },
    invest:               { icon: TrendingUp,      label: "Investment" },
    investment:           { icon: TrendingUp,      label: "Investment" },
    profit:               { icon: Sparkles,        label: "Daily profit" },
    daily_profit:         { icon: Sparkles,        label: "Daily profit" },
    referral_bonus:       { icon: Gift,            label: "Referral bonus" },
    referral_commission:  { icon: Gift,            label: "Referral commission" },
    welcome_bonus:        { icon: Gift,            label: "Welcome bonus" },
    coupon:               { icon: Ticket,          label: "Coupon" },
    coupon_redeem:        { icon: Ticket,          label: "Coupon redeem" },
    admin_credit:         { icon: ShieldCheck,     label: "Admin credit" },
    admin_debit:          { icon: ShieldCheck,     label: "Admin debit" },
  };
  return map[key] || { icon: Wallet, label: t.replace(/_/g, " ") || "Transaction" };
}

function Row({ t }) {
  const isCredit = t.amount >= 0;
  const meta = typeMeta(t.type);
  const Icon = meta.icon;
  const c = accent(t.id || t.created_at || t.type || "");
  const dt = new Date(t.created_at);
  return (
    <div
      data-testid={`tx-row-${t.id}`}
      className="relative overflow-hidden rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-card)] p-4 hover:border-[#0055FF]/40 transition-colors"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(180deg, ${c}, ${c}55)` }} />
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl pointer-events-none" style={{ background: c }} />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
            style={{ background: `${c}20`, border: `1px solid ${c}55` }}
          >
            <Icon className="w-4 h-4" style={{ color: c }} />
          </div>
          <div className="min-w-0">
            <div className="font-display font-700 text-sm truncate">{meta.label}</div>
            {t.note && (
              <div className="text-xs text-[var(--nb-muted)] mt-0.5 truncate" title={t.note}>{t.note}</div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-display font-800 tabular text-lg ${isCredit ? "text-[#10B981]" : "text-[#EF4444]"}`}>
            {isCredit ? <ArrowDownRight className="w-3 h-3 inline mr-0.5"/> : <ArrowUpRight className="w-3 h-3 inline mr-0.5"/>}
            {isCredit ? "+" : ""}{formatNaira(t.amount)}
          </div>
          <div className="text-[10px] text-[var(--nb-muted)] tabular mt-0.5">
            {dt.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(10);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/transactions").then((r) => setItems(r.data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { setVisible(10); }, [tab, q]);

  const filtered = useMemo(() => {
    let out = items;
    if (tab === "credits") out = out.filter((t) => t.amount >= 0);
    else if (tab === "debits") out = out.filter((t) => t.amount < 0);
    if (q) {
      const qq = q.toLowerCase();
      out = out.filter((t) =>
        (t.type || "").toLowerCase().includes(qq) ||
        (t.note || "").toLowerCase().includes(qq) ||
        String(t.amount || "").includes(qq)
      );
    }
    return out;
  }, [items, tab, q]);

  const counts = useMemo(() => ({
    all: items.length,
    credits: items.filter((t) => t.amount >= 0).length,
    debits:  items.filter((t) => t.amount < 0).length,
  }), [items]);

  const creditsSum = useMemo(() => items.filter((t) => t.amount >= 0).reduce((s, t) => s + t.amount, 0), [items]);
  const debitsSum  = useMemo(() => items.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0), [items]);

  return (
    <div className="space-y-5" data-testid="transactions-page">
      <div className="flex items-center gap-3">
        <Link to="/profile" data-testid="tx-back-link"
              className="w-9 h-9 rounded-lg border border-[var(--nb-border)] grid place-items-center text-[var(--nb-muted)] hover:text-white shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <SectionHeader
            title="Transaction history"
            subtitle={
              <>
                {items.length} wallet event{items.length === 1 ? "" : "s"} · <span className="text-[#10B981] tabular">+{formatNaira(creditsSum)}</span> in · <span className="text-[#EF4444] tabular">−{formatNaira(debitsSum)}</span> out
              </>
            }
            testid="tx-heading"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-[var(--nb-card)] border border-[var(--nb-border)]">
        {TABS.map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={`tx-tab-${k}`}
            className={`h-9 text-xs rounded-lg font-display font-700 transition-colors ${
              tab === k ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30" : "text-[var(--nb-muted)] hover:text-white"
            }`}
          >
            {label} <span className="opacity-60 tabular">({counts[k]})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3.5 text-[var(--nb-muted)]" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search type, note or amount"
               data-testid="tx-search-input"
               className="pl-9 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-[var(--nb-border)] p-8 text-center text-sm text-[var(--nb-muted)]" data-testid="tx-loading">
          Loading transactions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--nb-border)] p-8 text-center space-y-2" data-testid="tx-empty">
          <History className="w-6 h-6 text-[#0055FF] mx-auto" />
          <div className="text-sm text-[var(--nb-muted)]">
            {tab === "all" ? "No transactions yet." : `No ${tab} recorded.`}
          </div>
        </div>
      ) : (
        <>
          <div className="text-[10px] text-[var(--nb-muted)] tabular flex items-center justify-between" data-testid="tx-counter">
            <span>Showing {Math.min(visible, filtered.length)} of {filtered.length}</span>
            <span className="capitalize">{tab}</span>
          </div>
          <div className="grid gap-3" data-testid="tx-list">
            {filtered.slice(0, visible).map((t) => <Row key={t.id} t={t} />)}
          </div>
          <LoadMore
            shown={Math.min(visible, filtered.length)}
            total={filtered.length}
            onMore={setVisible}
            step={10}
            testid="tx-load-more"
          />
        </>
      )}
    </div>
  );
}
