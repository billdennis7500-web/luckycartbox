/**
 * CouponHistory — /coupon-history
 *
 * A celebratory ledger of every coupon this user has redeemed. Header stats
 * (total earned, daily vs manual counts) turn it into a "look how many drops
 * you bagged" streak wall. Rows show code, amount, when, and a colored
 * "Daily bonus" / "Special" chip so users can spot the auto-drops at a glance.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import { ArrowLeft, Gift, Ticket, Sparkles, ChevronRight } from "lucide-react";
import { SectionHeader, MicroLabel } from "@/components/design";

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const opts = isToday
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
    return (isToday ? "Today · " : "") + d.toLocaleString("en-GB", opts);
  } catch {
    return iso;
  }
}

function CouponRow({ item }) {
  const isDaily = item.coupon_type === "auto_daily";
  const accent = isDaily ? "#F5C518" : "#8B5CF6";
  return (
    <div
      className="relative rounded-xl overflow-hidden p-3 flex items-center gap-3 bg-[var(--nb-card)]"
      style={{ border: `1px solid ${accent}44` }}
      data-testid={`coupon-history-row-${item.id}`}
    >
      <div
        className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
        style={{
          background: `linear-gradient(135deg,${accent}22,${accent}0A)`,
          border: `1px solid ${accent}55`,
          color: accent,
        }}
      >
        {isDaily ? <Gift className="w-5 h-5" /> : <Ticket className="w-5 h-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="font-mono font-800 text-white text-sm truncate" data-testid={`coupon-history-code-${item.id}`}>
            {item.code || "—"}
          </div>
          <span
            className="text-[9px] font-display font-800 uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}55` }}
          >
            {isDaily ? "Daily bonus" : "Special"}
          </span>
        </div>
        <div className="text-[11px] text-[var(--nb-muted)] mt-0.5 tabular truncate">
          {formatWhen(item.created_at)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display font-800 text-white tabular text-base" style={{ color: accent }}>
          +{formatNaira(item.amount)}
        </div>
      </div>
    </div>
  );
}

export default function CouponHistory() {
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/coupons/history?limit=100");
      setData(r.data);
    } catch {
      setData({ items: [], total: 0, total_earned: 0, daily_count: 0, manual_count: 0 });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return (
      <div className="space-y-3" data-testid="coupon-history-skeleton">
        <div className="animate-pulse rounded-2xl bg-[var(--nb-card)] h-32" />
        <div className="animate-pulse rounded-xl bg-[var(--nb-card)] h-16" />
        <div className="animate-pulse rounded-xl bg-[var(--nb-card)] h-16" />
        <div className="animate-pulse rounded-xl bg-[var(--nb-card)] h-16" />
      </div>
    );
  }

  const empty = data.items.length === 0;

  return (
    <div className="space-y-5" data-testid="coupon-history-page">
      <div className="flex items-center gap-2">
        <Link
          to="/coupon"
          data-testid="coupon-history-back-link"
          className="w-9 h-9 rounded-full grid place-items-center border border-[var(--nb-border)] text-[var(--nb-muted)] hover:text-white hover:border-[#F5C518]/40"
          aria-label="Back to redeem"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <SectionHeader
          title="Coupon history"
          subtitle="Every bonus you've claimed."
          testid="coupon-history-heading"
          className="!m-0"
        />
      </div>

      {/* Streak stats — celebratory hero */}
      <div
        className="relative rounded-2xl overflow-hidden p-5 bg-[var(--nb-card)]"
        data-testid="coupon-history-stats"
        style={{
          border: "1px solid rgba(245,197,24,0.45)",
          boxShadow: "0 12px 40px -14px rgba(245,197,24,0.4), inset 0 0 0 1px rgba(255,229,128,0.08)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{ background: "linear-gradient(135deg, rgba(245,197,24,0.10) 0%, rgba(245,197,24,0.03) 55%, rgba(245,197,24,0) 100%)" }}
        />
        <div
          aria-hidden
          className="absolute -top-16 -right-10 w-56 h-56 rounded-full opacity-40 pointer-events-none blur-2xl"
          style={{ background: "radial-gradient(closest-side,#F5C518,transparent)" }}
        />
        <div className="relative">
          <MicroLabel tone="gold" className="!mt-0">Your claim streak</MicroLabel>
          <div className="font-display font-800 text-white text-3xl mt-1 tabular" data-testid="coupon-history-total-earned">
            {formatNaira(data.total_earned)}
          </div>
          <div className="text-xs text-[var(--nb-muted)] mt-1">
            Total bonus credited across every coupon.
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-xl bg-[var(--nb-card2)] p-2.5 border border-[var(--nb-border)]">
              <div className="text-[9px] uppercase tracking-widest text-[var(--nb-muted)]">Total</div>
              <div className="font-display font-800 text-white text-lg tabular" data-testid="coupon-history-total">
                {data.total}
              </div>
            </div>
            <div className="rounded-xl bg-[var(--nb-card2)] p-2.5 border border-[#F5C518]/30">
              <div className="text-[9px] uppercase tracking-widest text-[#F5C518]">Daily</div>
              <div className="font-display font-800 text-white text-lg tabular" data-testid="coupon-history-daily-count">
                {data.daily_count}
              </div>
            </div>
            <div className="rounded-xl bg-[var(--nb-card2)] p-2.5 border border-[#8B5CF6]/30">
              <div className="text-[9px] uppercase tracking-widest text-[#8B5CF6]">Special</div>
              <div className="font-display font-800 text-white text-lg tabular" data-testid="coupon-history-manual-count">
                {data.manual_count}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick access to redeem more */}
      {!empty && (
        <Link
          to="/coupon"
          data-testid="coupon-history-redeem-cta"
          className="flex items-center justify-between rounded-xl border border-[var(--nb-border)] bg-[var(--nb-card)] p-3 hover:border-[#F5C518]/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--nb-card2)] grid place-items-center text-[#F5C518]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm text-white font-display font-700">Redeem another code</div>
              <div className="text-xs text-[var(--nb-muted)]">Got a fresh coupon from admin or Telegram? Add it here</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--nb-muted)]" />
        </Link>
      )}

      {/* List */}
      {empty ? (
        <div
          className="rounded-2xl border border-dashed border-[var(--nb-border)] p-8 text-center"
          data-testid="coupon-history-empty"
        >
          <Gift className="w-10 h-10 text-[var(--nb-muted)] mx-auto mb-3" />
          <div className="font-display font-800 text-white text-lg">Your streak starts today</div>
          <div className="text-xs text-[var(--nb-muted)] mt-1">
            Grab today's Daily Bonus Drop from the dashboard or paste any coupon on the Redeem page.
          </div>
          <Link
            to="/coupon"
            data-testid="coupon-history-empty-cta"
            className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-full bg-[#F5C518] text-black font-display font-800 text-sm"
          >
            Redeem a code <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {data.items.map((it) => (
            <CouponRow key={it.id} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}
