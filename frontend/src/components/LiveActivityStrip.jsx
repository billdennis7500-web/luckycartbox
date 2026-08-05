/**
 * LiveActivityStrip — a compact "the platform is alive" widget for the top of
 * the dashboard. Two rows:
 *
 *   1. 24h TOTALS strip — three tabular pills: deposits / withdrawals /
 *      purchases with count and naira total, so anyone landing on the page
 *      instantly gets a sense of activity volume.
 *   2. LIVE TICKER — a vertically-marching feed of anonymised recent events
 *      ("Ad•• C•••••ma from Lagos funded ₦5,000") that auto-cycles every ~3s
 *      and refetches every 30s so the numbers keep breathing.
 *
 * All names are masked server-side (never expose PII). Cities are
 * deterministically mapped from the phone hash so the same user always shows
 * the same city (helps the feed feel "real" without doing any actual geoloc).
 */
import React, { useEffect, useRef, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { ArrowDownToLine, ArrowUpFromLine, ShoppingBag, TrendingUp } from "lucide-react";

const ICONS = {
  deposit:    { Icon: ArrowDownToLine, tint: "#10B981" },
  withdrawal: { Icon: ArrowUpFromLine, tint: "#F5C518" },
  purchase:   { Icon: ShoppingBag,     tint: "#8B5CF6" },
};

function StatPill({ Icon, label, count, total, tint }) {
  return (
    <div
      className="flex-1 min-w-0 rounded-xl px-3 py-2.5"
      style={{
        background: `linear-gradient(135deg, ${tint}18 0%, transparent 100%)`,
        border: `1px solid ${tint}30`,
      }}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-display font-700"
           style={{ color: tint }}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="mt-0.5 font-display font-800 text-white tabular text-sm truncate">
        {formatNaira(total)}
      </div>
      <div className="text-[10px] text-[var(--nb-muted)] tabular">
        {count.toLocaleString()} in 24h
      </div>
    </div>
  );
}

export default function LiveActivityStrip() {
  const [feed, setFeed] = useState(null);
  const [idx, setIdx] = useState(0);
  const rotateRef = useRef(null);

  // Fetch + refetch every 30s so the numbers stay fresh.
  useEffect(() => {
    let mounted = true;
    const fetchFeed = () => {
      api.get("/activity/feed").then((r) => { if (mounted) setFeed(r.data); }).catch(() => {});
    };
    fetchFeed();
    const t = setInterval(fetchFeed, 30_000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  // Rotate the ticker every 3s so users see multiple events without scrolling.
  useEffect(() => {
    if (!feed?.events?.length) return;
    rotateRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % feed.events.length);
    }, 3000);
    return () => rotateRef.current && clearInterval(rotateRef.current);
  }, [feed]);

  if (!feed) {
    return (
      <div className="rounded-2xl bg-[var(--nb-card)] border border-[var(--nb-border)] p-4 h-[130px] animate-pulse"
           data-testid="activity-strip-skeleton" />
    );
  }

  const { totals_24h = {}, events = [] } = feed;
  const dep  = totals_24h.deposits    || { count: 0, total: 0 };
  const wd   = totals_24h.withdrawals || { count: 0, total: 0 };
  const inv  = totals_24h.purchases   || { count: 0, total: 0 };
  const current = events[idx] || null;
  const meta = current ? (ICONS[current.type] || ICONS.deposit) : ICONS.deposit;
  const CurrentIcon = meta.Icon;

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)]"
      style={{
        boxShadow: "0 4px 24px -8px rgba(245,197,24,0.35), 0 0 0 1px rgba(245,197,24,0.20)",
      }}
      data-testid="live-activity-strip"
    >
      {/* Dashed gold accent */}
      <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none"
           style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.7 }} />

      <div className="p-4 space-y-3">
        {/* Header — live badge */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <div className="text-[10px] uppercase tracking-widest font-display font-800 text-emerald-400">
            Live · Last 24 hours
          </div>
          <div className="ml-auto flex items-center gap-1 text-[10px] tabular text-[var(--nb-muted)]">
            <TrendingUp className="w-3 h-3" /> {(dep.count + wd.count + inv.count).toLocaleString()} events
          </div>
        </div>

        {/* 3-pill totals row */}
        <div className="flex items-stretch gap-2">
          <StatPill Icon={ICONS.deposit.Icon}    label="Deposits"    count={dep.count} total={dep.total} tint={ICONS.deposit.tint} />
          <StatPill Icon={ICONS.withdrawal.Icon} label="Withdrawals" count={wd.count}  total={wd.total}  tint={ICONS.withdrawal.tint} />
          <StatPill Icon={ICONS.purchase.Icon}   label="Purchases"   count={inv.count} total={inv.total} tint={ICONS.purchase.tint} />
        </div>

        {/* Rotating ticker */}
        {current && (
          <div
            key={`${idx}-${current.at}`}   /* remount forces enter animation */
            className="rounded-xl px-3 py-2.5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300"
            style={{
              background: `linear-gradient(90deg, ${meta.tint}12 0%, transparent 100%)`,
              border: `1px solid ${meta.tint}25`,
            }}
            data-testid="ticker-event"
          >
            <div
              className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
              style={{ background: `${meta.tint}22`, border: `1px solid ${meta.tint}50`, color: meta.tint }}
            >
              <CurrentIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-white truncate">
                <span className="font-display font-700">{current.name}</span>
                <span className="text-[var(--nb-muted)]"> from </span>
                <span className="font-display font-700">{current.city}</span>
                <span className="text-[var(--nb-muted)]"> {current.verb}</span>
              </div>
              <div className="text-[11px] tabular font-display font-800" style={{ color: meta.tint }}>
                {formatNaira(current.amount)}
                {current.product && <span className="text-[var(--nb-muted)] font-500"> · {current.product}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
