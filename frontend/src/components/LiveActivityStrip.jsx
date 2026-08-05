/**
 * LiveActivityStrip — slim single-row live ticker for the dashboard.
 * Shows anonymised recent events like:
 *   "Ad•• C•••••ma from Lagos funded ₦5,000"
 *   "Se•• Fu••ke from Abuja cashed out ₦12,000"
 *   "Mi•• Ge••er from Kano activated a product · Lucky Cart · ₦3,000"
 * Rotates every ~3 s, refetches every 30 s. Names masked server-side.
 *
 * Deliberately compact — no headline row, no stat pills, no big totals.
 * Just one gently-animated event tile so it doesn't crowd the dashboard.
 */
import React, { useEffect, useRef, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { ArrowDownToLine, ArrowUpFromLine, ShoppingBag } from "lucide-react";

const ICONS = {
  deposit:    { Icon: ArrowDownToLine, tint: "#10B981" },
  withdrawal: { Icon: ArrowUpFromLine, tint: "#F5C518" },
  purchase:   { Icon: ShoppingBag,     tint: "#8B5CF6" },
};

export default function LiveActivityStrip() {
  const [events, setEvents] = useState(null);
  const [idx, setIdx] = useState(0);
  const rotateRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const fetchFeed = () => {
      api.get("/activity/feed")
        .then((r) => { if (mounted) setEvents(r.data?.events || []); })
        .catch(() => {});
    };
    fetchFeed();
    const t = setInterval(fetchFeed, 30_000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!events?.length) return;
    rotateRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % events.length);
    }, 3000);
    return () => rotateRef.current && clearInterval(rotateRef.current);
  }, [events]);

  // Skeleton — matches the tile height so there's no layout jump.
  if (!events) {
    return (
      <div className="rounded-xl bg-[var(--nb-card)] border border-[var(--nb-border)] h-12 animate-pulse"
           data-testid="activity-strip-skeleton" />
    );
  }
  if (!events.length) return null;

  const current = events[idx] || events[0];
  const meta = ICONS[current.type] || ICONS.deposit;
  const CurrentIcon = meta.Icon;

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-[var(--nb-card)]"
      style={{
        boxShadow: `0 4px 18px -8px ${meta.tint}55, 0 0 0 1px ${meta.tint}30`,
        transition: "box-shadow 300ms ease",
      }}
      data-testid="live-activity-strip"
    >
      {/* Rotating ticker tile */}
      <div
        key={`${idx}-${current.at}`}
        className="px-3 py-2.5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300"
        style={{
          background: `linear-gradient(90deg, ${meta.tint}12 0%, transparent 65%)`,
        }}
        data-testid="ticker-event"
      >
        {/* Live pulse dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>

        {/* Type icon */}
        <div
          className="w-7 h-7 rounded-md grid place-items-center shrink-0"
          style={{ background: `${meta.tint}22`, border: `1px solid ${meta.tint}55`, color: meta.tint }}
        >
          <CurrentIcon className="w-3.5 h-3.5" />
        </div>

        {/* Copy */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <div className="min-w-0 flex-1 text-[11px] leading-tight truncate">
            <span className="font-display font-700 text-white">{current.name}</span>
            <span className="text-[var(--nb-muted)]"> · </span>
            <span className="text-[var(--nb-muted)]">{current.city}</span>
            <span className="text-[var(--nb-muted)]"> · {current.verb}</span>
          </div>
          <div
            className="text-[11px] tabular font-display font-800 shrink-0"
            style={{ color: meta.tint }}
          >
            {formatNaira(current.amount)}
          </div>
        </div>
      </div>
    </div>
  );
}
