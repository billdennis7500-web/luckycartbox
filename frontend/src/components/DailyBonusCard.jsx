/**
 * DailyBonusCard — /dashboard
 *
 * Renders the admin-generated daily coupon (from GET /api/coupons/daily) with:
 *   • The code itself + copy button
 *   • Amount, remaining redemptions counter (used/max)
 *   • Big "Redeem now" button that hits POST /api/coupons/redeem
 *   • Live countdown to the next drop when today's is missing / sold out
 *   • Friendly gate when user hasn't invested yet
 *
 * All copy is written to match the Luckycart Box treasure/reward vibe.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatApiError, formatNaira } from "@/lib/api";
import { toast } from "sonner";
import { Gift, Copy, Check, Sparkles, Clock, Users, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicroLabel } from "@/components/design";

function useCountdown(targetISO) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    if (!targetISO) return null;
    const diff = new Date(targetISO).getTime() - now;
    if (diff <= 0) return { h: 0, m: 0, s: 0, done: true };
    const total = Math.floor(diff / 1000);
    return {
      h: Math.floor(total / 3600),
      m: Math.floor((total % 3600) / 60),
      s: total % 60,
      done: false,
    };
  }, [targetISO, now]);
}

function CountdownPill({ nextDropAt }) {
  const t = useCountdown(nextDropAt);
  if (!t) return null;
  const parts = [];
  if (t.h > 0) parts.push(`${t.h}h`);
  parts.push(`${String(t.m).padStart(2, "0")}m`);
  parts.push(`${String(t.s).padStart(2, "0")}s`);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-display font-700 uppercase tracking-widest px-2 py-1 rounded-full"
      style={{
        background: "rgba(245,197,24,0.10)",
        border: "1px solid rgba(245,197,24,0.35)",
        color: "#F5C518",
      }}
      data-testid="daily-bonus-countdown"
    >
      <Clock className="w-3 h-3" />
      Next drop in {parts.join(" ")}
    </span>
  );
}

export default function DailyBonusCard({ hasInvested }) {
  const [data, setData] = useState(null);
  const [redeeming, setRedeeming] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/coupons/daily");
      setData(r.data);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
    // Poll every 60s so we auto-refresh right after the drop time
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const copyCode = async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      toast.success(`Copied ${data.code}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed — long-press the code to copy manually");
    }
  };

  const redeem = async () => {
    if (!data?.code) return;
    setRedeeming(true);
    try {
      const r = await api.post("/coupons/redeem", { code: data.code });
      toast.success(`🎉 ${formatNaira(r.data.amount)} credited to your wallet!`);
      await load();
      // Nudge parent to reload wallet via a soft event — parent already
      // refetches user on route focus, so no-op here.
      window.dispatchEvent(new CustomEvent("wallet:refresh"));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Redeem failed");
    } finally {
      setRedeeming(false);
    }
  };

  if (!data || !data.enabled) return null;

  // States: no coupon yet (before drop time), sold out, already redeemed,
  // can-redeem, requires-invest
  const noCoupon = !data.available;
  const soldOut = data.available && data.sold_out;
  const already = data.available && data.already_redeemed;
  const canRedeem = data.available && data.can_redeem;

  return (
    <section
      className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-4 sm:p-5"
      data-testid="daily-bonus-card"
      style={{
        border: "1px solid rgba(245,197,24,0.45)",
        boxShadow:
          "0 12px 40px -14px rgba(245,197,24,0.45), inset 0 0 0 1px rgba(255,229,128,0.08)",
      }}
    >
      {/* Warm gold overlay wash */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          background:
            "linear-gradient(135deg, rgba(245,197,24,0.10) 0%, rgba(245,197,24,0.03) 55%, rgba(245,197,24,0) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-16 -right-10 w-56 h-56 rounded-full opacity-40 pointer-events-none blur-2xl"
        style={{ background: "radial-gradient(closest-side,#F5C518,transparent)" }}
      />

      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
            style={{
              background: "linear-gradient(135deg,#FFE580,#F5C518)",
              color: "#1A1508",
              boxShadow: "0 6px 16px rgba(245,197,24,0.45)",
            }}
          >
            <Gift className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <MicroLabel tone="gold" className="!mt-0">Daily bonus drop</MicroLabel>
            <div className="font-display font-800 text-white text-lg leading-tight">
              {canRedeem
                ? `Grab today's ${formatNaira(data.amount)} 🎁`
                : already
                  ? "You claimed today's bonus"
                  : soldOut
                    ? "Sold out for today"
                    : `Drops daily at ${data.drop_time}`}
            </div>
          </div>
        </div>

        {/* Body varies by state */}
        {canRedeem && (
          <>
            <div className="rounded-xl bg-[var(--nb-card2)] border border-[var(--nb-border)] p-3 flex items-center gap-2" data-testid="daily-bonus-code-row">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Today's code</div>
                <div className="font-mono font-800 text-white text-lg tracking-widest truncate" data-testid="daily-bonus-code">
                  {data.code}
                </div>
              </div>
              <Button
                onClick={copyCode}
                data-testid="daily-bonus-copy-btn"
                className={`h-10 px-3 shrink-0 ${
                  copied
                    ? "bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/60"
                    : "bg-[var(--nb-card)] hover:bg-[var(--nb-border)] text-white border border-[var(--nb-border)]"
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-[var(--nb-muted)]">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span className="tabular text-white font-display font-700">{data.remaining}</span>
                <span>of {data.max_uses} left</span>
              </span>
              <CountdownPill nextDropAt={data.next_drop_at} />
            </div>
            <Button
              onClick={redeem}
              disabled={redeeming}
              data-testid="daily-bonus-redeem-btn"
              className="mt-3 w-full h-11 bg-[#F5C518] hover:bg-[#E1B516] text-black font-display font-800 rounded-xl disabled:opacity-60"
            >
              {redeeming ? "Claiming…" : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Redeem {formatNaira(data.amount)}
                </>
              )}
            </Button>
          </>
        )}

        {already && (
          <div className="rounded-xl bg-[#10B981]/10 border border-[#10B981]/30 p-3 flex items-center gap-3" data-testid="daily-bonus-claimed-state">
            <PartyPopper className="w-5 h-5 text-[#10B981] shrink-0" />
            <div className="text-xs text-[var(--nb-muted)]">
              You bagged <span className="text-white font-display font-700">{formatNaira(data.amount)}</span> from today's drop.{" "}
              <CountdownPill nextDropAt={data.next_drop_at} />
            </div>
          </div>
        )}

        {soldOut && (
          <div className="rounded-xl bg-[var(--nb-card2)] border border-[var(--nb-border)] p-3 flex items-center gap-3" data-testid="daily-bonus-soldout-state">
            <Clock className="w-5 h-5 text-[var(--nb-muted)] shrink-0" />
            <div className="text-xs text-[var(--nb-muted)]">
              All {data.max_uses} slots claimed. A fresh code drops daily at{" "}
              <span className="text-white font-display font-700">{data.drop_time}</span>.{" "}
              <CountdownPill nextDropAt={data.next_drop_at} />
            </div>
          </div>
        )}

        {noCoupon && (
          <div className="rounded-xl bg-[var(--nb-card2)] border border-[var(--nb-border)] p-3 flex items-center gap-3" data-testid="daily-bonus-waiting-state">
            <Clock className="w-5 h-5 text-[#F5C518] shrink-0" />
            <div className="text-xs text-[var(--nb-muted)] flex-1">
              Today's code drops at <span className="text-white font-display font-700">{data.drop_time}</span>. Come back and claim.
            </div>
            <CountdownPill nextDropAt={data.next_drop_at} />
          </div>
        )}

        {canRedeem && data.requires_investment && (
          <div className="mt-2 text-[11px] text-[#F59E0B]">
            You need to invest at least once before you can redeem this code.
          </div>
        )}
      </div>
    </section>
  );
}
