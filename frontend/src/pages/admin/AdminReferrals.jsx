import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Percent } from "lucide-react";

export default function AdminReferrals() {
  const [s, setS] = useState(null);

  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);

  const save = async () => {
    try {
      await api.put("/admin/settings", {
        referral_gen1_pct: Number(s.referral_gen1_pct),
        referral_gen2_pct: Number(s.referral_gen2_pct),
        referral_gen3_pct: Number(s.referral_gen3_pct),
      });
      toast.success("Referral rates updated");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  if (!s) return <div className="text-[#94A3B8]">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-referrals-heading">Referral commissions</h1>
        <p className="text-[#94A3B8] mt-2">Set the commission percent for each generation.</p>
      </div>

      <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl">
        <div className="grid grid-cols-3 gap-4">
          {[
            ["Gen 1", "referral_gen1_pct", "gen1"],
            ["Gen 2", "referral_gen2_pct", "gen2"],
            ["Gen 3", "referral_gen3_pct", "gen3"],
          ].map(([label, key, tid]) => (
            <div key={key}>
              <Label>{label} %</Label>
              <div className="relative mt-2">
                <Percent className="w-4 h-4 absolute right-3 top-3.5 text-[#94A3B8]" />
                <Input type="number" step="0.1" value={s[key]}
                       onChange={(e) => setS({ ...s, [key]: e.target.value })}
                       data-testid={`ref-${tid}-input`}
                       className="bg-[#121E30] border-[#1A2B44] text-white h-11 pr-9" />
              </div>
            </div>
          ))}
        </div>
        <Button onClick={save} data-testid="ref-save-btn" className="mt-6 bg-[#0055FF] hover:bg-[#3377FF]">Save</Button>
      </Card>
    </div>
  );
}
