import React, { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Coupon() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const redeem = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/coupons/redeem", { code });
      toast.success(`Coupon redeemed. ₦${data.amount.toLocaleString()} credited.`);
      setCode(""); await refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="coupon-heading">Redeem coupon</h1>
        <p className="text-[#94A3B8] mt-2">Enter a promo code to top up your wallet.</p>
      </div>

      {!user?.has_invested && (
        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-5 text-sm" data-testid="coupon-locked-banner">
          You must invest before redeeming coupon codes.
        </div>
      )}

      <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl">
        <form onSubmit={redeem} className="space-y-4">
          <div>
            <Label>Coupon code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required
                   placeholder="ENTER-CODE"
                   data-testid="coupon-code-input"
                   className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-12 tracking-widest uppercase font-display font-600 text-lg" />
          </div>
          <Button type="submit" disabled={loading || !user?.has_invested}
                  data-testid="coupon-redeem-button"
                  className="w-full h-11 bg-[#0055FF] hover:bg-[#3377FF] rounded-md glow-primary">
            <Ticket className="w-4 h-4 mr-2" />
            {loading ? "Redeeming…" : "Redeem code"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
