import React, { useEffect, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { TrendingUp, Zap, Coins, Timer, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import LoadMore from "@/components/LoadMore";

export default function Marketplace() {
  const { user, refresh } = useAuth();
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(6);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="marketplace-heading">
          Investment plans
        </h1>
        <p className="text-sm text-[var(--nb-muted)] mt-1">Pick a plan. Profits drop every 24 hours until it matures.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.slice(0, visible).map((p) => {
          const dailyEarn = p.price * (p.daily_profit_pct / 100);
          const totalReturn = dailyEarn * p.duration_days;
          const affordable = (user?.wallet_balance || 0) >= p.price;
          return (
            <Card
              key={p.id}
              className="bg-[var(--nb-card)] border border-[var(--nb-border)] rounded-2xl p-5 card-hover flex flex-col"
              data-testid={`product-card-${p.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-md bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
                  <TrendingUp className="w-5 h-5 text-[#0055FF]" />
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                  Live
                </span>
              </div>

              <h3 className="mt-4 font-display font-600 text-lg">{p.name}</h3>
              <p className="text-xs text-[var(--nb-muted)] mt-1 min-h-[36px] line-clamp-2">{p.description}</p>

              {/* Daily figure highlight */}
              <div
                data-testid={`product-daily-${p.id}`}
                className="mt-4 rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 p-4"
              >
                <div className="text-[10px] uppercase tracking-widest text-[#10B981]/80 flex items-center gap-1">
                  <Coins className="w-3 h-3" /> Earn every 24 hours
                </div>
                <div className="mt-1.5 font-display font-800 text-2xl tabular text-[#10B981]">
                  {formatNaira(dailyEarn)}
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--nb-muted)] tabular">
                  ≈ {p.daily_profit_pct}% of your investment · daily
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="border border-[var(--nb-border)] rounded-lg p-2.5">
                  <div className="text-[10px] text-[var(--nb-muted)] uppercase tracking-wider">Stake</div>
                  <div className="mt-0.5 font-display font-600 tabular">{formatNaira(p.price)}</div>
                </div>
                <div className="border border-[var(--nb-border)] rounded-lg p-2.5">
                  <div className="text-[10px] text-[var(--nb-muted)] uppercase tracking-wider">Duration</div>
                  <div className="mt-0.5 font-display font-600 tabular">{p.duration_days} days</div>
                </div>
                <div className="col-span-2 border border-[#0055FF]/40 bg-[#0055FF]/10 rounded-lg p-2.5">
                  <div className="text-[10px] text-[#0055FF] uppercase tracking-wider">Total return</div>
                  <div className="mt-0.5 font-display font-800 tabular text-[#0055FF]">
                    {formatNaira(totalReturn)}
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setSelected(p)}
                data-testid={`product-invest-btn-${p.id}`}
                className="mt-4 bg-[#0055FF] hover:bg-[#3377FF] rounded-md h-11"
              >
                <Zap className="w-4 h-4 mr-1" />
                {affordable ? "Invest now" : "Insufficient wallet"}
              </Button>
            </Card>
          );
        })}
      </div>
      <LoadMore shown={Math.min(visible, products.length)} total={products.length} onMore={setVisible} step={6} testid="load-more-products" />

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
