import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AdminSettings() {
  const [s, setS] = useState(null);

  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);

  const save = async () => {
    try {
      await api.put("/admin/settings", {
        welcome_bonus: Number(s.welcome_bonus),
        min_deposit: Number(s.min_deposit),
        min_withdrawal: Number(s.min_withdrawal),
        site_name: s.site_name,
      });
      toast.success("Settings saved");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  if (!s) return <div className="text-[#94A3B8]">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-settings-heading">Platform settings</h1>
        <p className="text-[#94A3B8] mt-2">Welcome bonus, limits, branding.</p>
      </div>
      <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl space-y-4">
        <div>
          <Label>Site name</Label>
          <Input value={s.site_name} onChange={(e) => setS({ ...s, site_name: e.target.value })}
                 data-testid="setting-sitename"
                 className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
        </div>
        <div>
          <Label>Welcome bonus (₦)</Label>
          <Input type="number" value={s.welcome_bonus} onChange={(e) => setS({ ...s, welcome_bonus: e.target.value })}
                 data-testid="setting-welcome"
                 className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Minimum deposit (₦)</Label>
            <Input type="number" value={s.min_deposit} onChange={(e) => setS({ ...s, min_deposit: e.target.value })}
                   data-testid="setting-mindep"
                   className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
          </div>
          <div>
            <Label>Minimum withdrawal (₦)</Label>
            <Input type="number" value={s.min_withdrawal} onChange={(e) => setS({ ...s, min_withdrawal: e.target.value })}
                   data-testid="setting-minwd"
                   className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
          </div>
        </div>
        <Button onClick={save} data-testid="setting-save-btn" className="bg-[#0055FF] hover:bg-[#3377FF]">Save</Button>
      </Card>
    </div>
  );
}
