import React, { useEffect, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TrendingUp, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Marketplace() {
  const { user, refresh } = useAuth();
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => api.get("/products").then((r) => setProducts(r.data));
  useEffect(() => { load(); }, []);

  const invest = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await api.post("/invest", { product_id: selected.id });
      toast.success(`Invested ₦${selected.price.toLocaleString()} in ${selected.name}`);
      setSelected(null);
      await refresh();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Investment failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="marketplace-heading">
          Investment plans
        </h1>
        <p className="text-[#94A3B8] mt-2">Pick a plan. Profits drop every 24 hours until it matures.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {products.map((p) => {
          const totalReturn = p.price * (p.daily_profit_pct / 100) * p.duration_days;
          const affordable = (user?.wallet_balance || 0) >= p.price;
          return (
            <Card key={p.id} className="bg-[#0B1524] border border-[#1A2B44] rounded-xl p-6 card-hover flex flex-col" data-testid={`product-card-${p.id}`}>
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-md bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
                  <TrendingUp className="w-5 h-5 text-[#0055FF]" />
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">Live</span>
              </div>
              <h3 className="mt-4 font-display font-600 text-xl">{p.name}</h3>
              <p className="text-sm text-[#94A3B8] mt-1 min-h-[40px]">{p.description}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="border border-[#1A2B44] rounded-lg p-3">
                  <div className="text-xs text-[#94A3B8]">Price</div>
                  <div className="font-display font-800 tabular">{formatNaira(p.price)}</div>
                </div>
                <div className="border border-[#1A2B44] rounded-lg p-3">
                  <div className="text-xs text-[#94A3B8]">Daily profit</div>
                  <div className="font-display font-800 tabular">{p.daily_profit_pct}%</div>
                </div>
                <div className="border border-[#1A2B44] rounded-lg p-3">
                  <div className="text-xs text-[#94A3B8]">Duration</div>
                  <div className="font-display font-800 tabular">{p.duration_days} days</div>
                </div>
                <div className="border border-[#0055FF]/40 bg-[#0055FF]/10 rounded-lg p-3">
                  <div className="text-xs text-[#0055FF]">Total return</div>
                  <div className="font-display font-800 tabular">{formatNaira(totalReturn)}</div>
                </div>
              </div>
              <Button
                onClick={() => setSelected(p)}
                data-testid={`product-invest-btn-${p.id}`}
                className="mt-5 bg-[#0055FF] hover:bg-[#3377FF] rounded-md h-11"
              >
                <Zap className="w-4 h-4 mr-1" /> {affordable ? "Invest now" : "Insufficient balance"}
              </Button>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-[#0B1524] border-[#1A2B44] text-white">
          <DialogHeader>
            <DialogTitle className="font-display">Confirm investment</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-[#94A3B8]">Plan</span><span>{selected.name}</span></div>
              <div className="flex justify-between"><span className="text-[#94A3B8]">Amount</span><span className="tabular">{formatNaira(selected.price)}</span></div>
              <div className="flex justify-between"><span className="text-[#94A3B8]">Daily profit</span><span className="tabular">{selected.daily_profit_pct}%</span></div>
              <div className="flex justify-between"><span className="text-[#94A3B8]">Duration</span><span className="tabular">{selected.duration_days} days</span></div>
              <div className="flex justify-between pt-2 border-t border-[#1A2B44]">
                <span className="text-[#94A3B8]">Total return</span>
                <span className="text-[#10B981] tabular font-display font-600">
                  {formatNaira(selected.price * (selected.daily_profit_pct / 100) * selected.duration_days)}
                </span>
              </div>
              <div className="flex justify-between text-[#94A3B8] pt-2">
                <span>Your wallet</span>
                <span className="tabular">{formatNaira(user?.wallet_balance)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-[#1A2B44] bg-transparent text-white" onClick={() => setSelected(null)}>Cancel</Button>
            <Button
              onClick={invest}
              disabled={loading}
              data-testid="confirm-invest-button"
              className="bg-[#0055FF] hover:bg-[#3377FF]"
            >
              {loading ? "Processing…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
