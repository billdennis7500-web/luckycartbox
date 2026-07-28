import React, { useEffect, useState, useMemo } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { Zap, Coins, Timer, Wallet, Flame, TrendingUp, Sparkles, ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import LoadMore from "@/components/LoadMore";

/* -------------------------------------------------------------------------- */
/*  Tier presets — badge color + glow color. `tier` is an optional field on   */
/*  the product model. If unset, we auto-pick based on daily_profit_pct.       */
/* -------------------------------------------------------------------------- */
const TIER_PRESETS = {
  legendary: { label: "Legendary", chipBg: "#F5C518", chipFg: "#1A1508", glow: "#F5C518" },
  epic:      { label: "Epic",      chipBg: "#A855F7", chipFg: "#FFFFFF", glow: "#A855F7" },
  hot:       { label: "Hot",       chipBg: "#EF4444", chipFg: "#FFFFFF", glow: "#EF4444" },
  newcomer:  { label: "Newcomer",  chipBg: "#10B981", chipFg: "#FFFFFF", glow: "#10B981" },
  tech:      { label: "Tech",      chipBg: "#0055FF", chipFg: "#FFFFFF", glow: "#0055FF" },
  fashion:   { label: "Fashion",   chipBg: "#EC4899", chipFg: "#FFFFFF", glow: "#EC4899" },
  standard:  { label: "Standard",  chipBg: "#64748B", chipFg: "#FFFFFF", glow: "#F5C518" },
};

function tierFor(p) {
  if (p.tier && TIER_PRESETS[p.tier]) return { key: p.tier, ...TIER_PRESETS[p.tier] };
  // Auto: derive from daily profit
  const d = Number(p.daily_profit_pct) || 0;
  if (d >= 10) return { key: "legendary", ...TIER_PRESETS.legendary };
  if (d >= 7)  return { key: "epic",      ...TIER_PRESETS.epic };
  if (d >= 5)  return { key: "hot",       ...TIER_PRESETS.hot };
  return { key: "standard", ...TIER_PRESETS.standard };
}

/* -------------------------------------------------------------------------- */
/*  Ambient default image — an SVG that looks like a treasure chest, used     */
/*  when a product has no admin-uploaded image_url yet.                        */
/* -------------------------------------------------------------------------- */
const DEFAULT_IMAGE = (
  <div className="relative w-full h-full grid place-items-center">
    <div className="absolute inset-0 rounded-lg opacity-40"
         style={{ background: "radial-gradient(circle at center, rgba(255,215,80,0.55), rgba(255,215,80,0.05) 65%, transparent 80%)" }} />
    <div className="relative z-10 text-center">
      <div className="mx-auto w-16 h-16 rounded-xl grid place-items-center"
           style={{ background: "linear-gradient(135deg, #FFE580 0%, #F5C518 100%)",
                    boxShadow: "0 4px 24px rgba(245,197,24,0.55), inset 0 2px 8px rgba(255,255,255,0.35)" }}>
        <TrendingUp className="w-8 h-8 text-[#1A1508]" />
      </div>
      <div className="mt-2 text-[10px] font-display font-800 uppercase tracking-[0.15em] text-[#F5C518]/90">
        Investment
      </div>
    </div>
  </div>
);

export default function Marketplace() {
  const { user, refresh } = useAuth();
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(6);
  const [filter, setFilter] = useState("all");

  const load = () => api.get("/products").then((r) => setProducts(r.data));
  useEffect(() => { load(); }, []);

  const invest = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await api.post("/invest", { product_id: selected.id });
      toast.success(`Invested ${formatNaira(selected.price)} in ${selected.name}`);
      setSelected(null);
      await refresh();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Investment failed");
    } finally { setLoading(false); }
  };

  const tiersPresent = useMemo(() => {
    const set = new Set(["all"]);
    products.forEach((p) => set.add(tierFor(p).key));
    return Array.from(set);
  }, [products]);

  const filtered = filter === "all" ? products : products.filter((p) => tierFor(p).key === filter);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 rounded-sm bg-[#F5C518]" />
          <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="marketplace-heading">
            Investment plans
          </h1>
        </div>
        <p className="text-sm text-[var(--nb-muted)] mt-1 ml-3">
          Pick a plan. Profits drop every 24 hours until it matures.
        </p>
      </div>

      {tiersPresent.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 hide-scrollbar" data-testid="tier-filter-scroll">
          {tiersPresent.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              data-testid={`tier-filter-${t}`}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-display font-700 transition-all ${
                filter === t
                  ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30"
                  : "bg-transparent text-[var(--nb-muted)] hover:text-white"
              }`}
            >
              {t === "all" ? "All" : TIER_PRESETS[t]?.label || t}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {filtered.slice(0, visible).map((p) => (
          <ProductRow key={p.id} p={p} onOpen={() => setSelected(p)} user={user} />
        ))}
      </div>

      <LoadMore
        shown={Math.min(visible, filtered.length)}
        total={filtered.length}
        onMore={setVisible}
        step={6}
        testid="load-more-products"
      />

      {/* Slide-up confirm drawer */}
      <Drawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DrawerContent
          data-testid="invest-drawer"
          className="bg-[var(--nb-card)] border-t border-[var(--nb-border)] text-white max-w-lg mx-auto rounded-t-2xl"
        >
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-[var(--nb-border)]" />
          <DrawerHeader>
            <DrawerTitle className="font-display text-xl">Confirm your investment</DrawerTitle>
            <DrawerDescription className="text-[var(--nb-muted)]">
              We'll deduct the stake from your wallet and start dropping daily profits in 24 hours.
            </DrawerDescription>
          </DrawerHeader>
          {selected && (
            <div className="px-4 pb-2 space-y-4">
              <Card className="bg-[var(--nb-page)] border-[var(--nb-border)] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Plan</div>
                    <div className="mt-1 font-display font-800 text-lg">{selected.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Stake</div>
                    <div className="mt-1 font-display font-800 text-lg tabular">{formatNaira(selected.price)}</div>
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-[#10B981]/80 flex items-center gap-1">
                    <Coins className="w-3 h-3" /> Daily earn
                  </div>
                  <div className="mt-1 font-display font-800 tabular text-[#10B981]">
                    {formatNaira(selected.price * (selected.daily_profit_pct / 100))}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--nb-border)] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)] flex items-center gap-1">
                    <Timer className="w-3 h-3" /> Runs for
                  </div>
                  <div className="mt-1 font-display font-800 tabular">{selected.duration_days} days</div>
                </div>
                <div className="col-span-2 rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-[#0055FF]">Total you'll get back</div>
                  <div className="mt-1 font-display font-800 text-xl tabular text-[#0055FF]">
                    {formatNaira(selected.price * (selected.daily_profit_pct / 100) * selected.duration_days)}
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-between text-xs text-[var(--nb-muted)] px-1">
                  <span className="flex items-center gap-1"><Wallet className="w-3 h-3"/> Your wallet</span>
                  <span className="tabular">{formatNaira(user?.wallet_balance)}</span>
                </div>
              </div>
            </div>
          )}
          <DrawerFooter className="pt-2">
            <Button
              onClick={invest}
              disabled={loading}
              data-testid="confirm-invest-button"
              className="bg-[#0055FF] hover:bg-[#3377FF] h-12 rounded-xl"
            >
              {loading ? "Processing…" : "Confirm & invest"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="border-[var(--nb-border)] bg-transparent text-white h-11 rounded-xl">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  A single product row — horizontal card, image left, info right, with the  */
/*  ambient tier-colored glow border seen in the mystery-box reference.        */
/* -------------------------------------------------------------------------- */

function ProductRow({ p, onOpen, user }) {
  const tier = tierFor(p);
  const dailyEarn = p.price * (p.daily_profit_pct / 100);
  const totalReturn = dailyEarn * p.duration_days;
  const affordable = (user?.wallet_balance || 0) >= p.price;

  return (
    <div
      className="relative rounded-2xl overflow-hidden card-hover"
      style={{
        // Ambient tier-color glow behind the card
        boxShadow: `0 6px 32px -8px ${tier.glow}55, 0 0 0 1px ${tier.glow}20`,
      }}
      data-testid={`product-card-${p.id}`}
    >
      {/* Top + bottom dashed accent lines — matches the reference's gold divider aesthetic */}
      <div className="absolute inset-x-0 top-0 h-[2px]"
           style={{ background: `repeating-linear-gradient(90deg, ${tier.glow} 0 8px, transparent 8px 14px)`, opacity: 0.5 }} />
      <div className="absolute inset-x-0 bottom-0 h-[2px]"
           style={{ background: `repeating-linear-gradient(90deg, ${tier.glow} 0 8px, transparent 8px 14px)`, opacity: 0.5 }} />

      <Card className="relative bg-[var(--nb-card)] border-0 rounded-2xl overflow-hidden">
        <div className="flex items-stretch min-h-[160px]">
          {/* --- LEFT: image area (~38% width) --- */}
          <div
            className="relative shrink-0 w-[38%] max-w-[180px] min-h-full grid place-items-center p-4"
            style={{
              background:
                "linear-gradient(135deg, #1E1B0A 0%, #2A2410 45%, #0B0906 100%)",
            }}
          >
            {/* Tier badge — top-left of image, matching reference */}
            <div
              className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2 py-1 rounded-full font-display font-700 uppercase tracking-wider text-[10px] shadow-lg"
              style={{ background: tier.chipBg, color: tier.chipFg }}
              data-testid={`product-tier-${p.id}`}
            >
              <Sparkles className="w-3 h-3" />
              {tier.label}
            </div>

            {/* Image or default illustration */}
            <div className="relative w-full h-full grid place-items-center">
              {p.image_url ? (
                <>
                  {/* radial gold-glow behind the image */}
                  <div className="absolute inset-0 rounded-lg opacity-60 pointer-events-none"
                       style={{ background: `radial-gradient(circle at center, ${tier.glow}55, ${tier.glow}12 55%, transparent 75%)` }} />
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="relative z-10 max-w-full max-h-[140px] object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)]"
                    data-testid={`product-image-${p.id}`}
                  />
                </>
              ) : (
                DEFAULT_IMAGE
              )}
            </div>

            {/* Product name label at bottom of image, like the reference */}
            {p.image_url && (
              <div className="absolute bottom-2 inset-x-2 z-20 text-center">
                <span className="inline-block px-2 py-0.5 rounded font-display font-800 text-[11px] tracking-wide text-white"
                      style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)" }}>
                  {p.name}
                </span>
              </div>
            )}
          </div>

          {/* --- RIGHT: content area --- */}
          <div className="flex-1 min-w-0 p-4 flex flex-col justify-between gap-3">
            {/* Top row: name + daily-profit chip */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display font-800 text-lg tracking-tight text-white line-clamp-2"
                  data-testid={`product-name-${p.id}`}>
                {p.name}
              </h3>
              <div className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-[#F97316]/15 border border-[#F97316]/30 text-[11px] font-display font-700 text-[#F97316]"
                   data-testid={`product-daily-chip-${p.id}`}>
                <Flame className="w-3 h-3" />
                {p.daily_profit_pct}%/day
              </div>
            </div>

            {/* Total return chip (mimics the "Resale" price range in the reference) */}
            <div className="inline-flex self-start px-2.5 py-1 rounded-md border border-[#F5C518]/30 bg-[#F5C518]/10">
              <span className="font-display font-600 text-[11px] text-[#F5C518] tabular"
                    data-testid={`product-return-${p.id}`}>
                Total return {formatNaira(totalReturn)}
              </span>
            </div>

            {/* Big price + duration */}
            <div className="flex items-end gap-2 mt-1">
              <div className="font-display font-800 text-3xl tabular text-white tracking-tight"
                   data-testid={`product-price-${p.id}`}>
                {formatNaira(p.price)}
              </div>
              <div className="text-[11px] text-[var(--nb-muted)] pb-1 whitespace-nowrap">
                · {p.duration_days} days
              </div>
            </div>

            {/* Bottom row: trust icons + CTA */}
            <div className="flex items-center justify-between gap-2 mt-1">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--nb-muted)]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
                <span className="hidden sm:inline">Auto-payout · </span>
                <span>Daily drop</span>
              </div>
              <Button
                onClick={onOpen}
                disabled={!affordable}
                data-testid={`product-invest-btn-${p.id}`}
                className="bg-[#7C3AED] hover:bg-[#6D28D9] disabled:bg-[#4B5563] disabled:cursor-not-allowed rounded-full h-9 px-4 text-sm font-display font-700 shadow-lg shadow-[#7C3AED]/30"
              >
                {affordable ? (
                  <>
                    <Zap className="w-3.5 h-3.5 mr-1" /> Invest Now <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </>
                ) : "Insufficient wallet"}
              </Button>
            </div>
          </div>
        </div>

        {p.description && (
          <div className="px-4 pb-3 -mt-1 text-[11px] text-[var(--nb-muted)] line-clamp-2 border-t border-[var(--nb-border)] pt-2">
            {p.description}
          </div>
        )}
      </Card>
    </div>
  );
}
