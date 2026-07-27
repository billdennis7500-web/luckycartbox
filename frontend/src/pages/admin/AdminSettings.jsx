import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [pn, setPn] = useState(null);

  useEffect(() => {
    api.get("/admin/settings").then((r) => setS(r.data));
    api.get("/admin/paynow/status").then((r) => setPn(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    try {
      await api.put("/admin/settings", {
        welcome_bonus: Number(s.welcome_bonus),
        min_deposit: Number(s.min_deposit),
        min_withdrawal: Number(s.min_withdrawal),
        site_name: s.site_name,
        telegram_url: (s.telegram_url || "").trim(),
        welcome_message: (s.welcome_message || "").trim(),
      });
      toast.success("Settings saved");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  const copy = (v) => { navigator.clipboard.writeText(v); toast.success("Copied"); };
  const base = process.env.REACT_APP_BACKEND_URL || "";
  const payinHook = `${base}/api/webhooks/paynow/payin`;
  const payoutHook = `${base}/api/webhooks/paynow/payout`;

  if (!s) return <div className="text-[#94A3B8]">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-settings-heading">Platform settings</h1>
        <p className="text-[#94A3B8] mt-2">Welcome bonus, limits, branding, gateway webhook URLs.</p>
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

        <div className="pt-3 border-t border-[#1A2B44]">
          <div className="text-xs uppercase tracking-widest text-[#94A3B8] mb-3">Community & welcome pop-up</div>
          <Label>Telegram community URL</Label>
          <Input
            value={s.telegram_url || ""}
            onChange={(e) => setS({ ...s, telegram_url: e.target.value })}
            placeholder="https://t.me/your-community"
            data-testid="setting-telegram-url"
            className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11"
          />
          <p className="text-xs text-[#94A3B8] mt-1">Shown as a "Join Telegram" chip on the user dashboard and welcome modal.</p>

          <div className="mt-4">
            <Label>Welcome pop-up message</Label>
            <textarea
              value={s.welcome_message || ""}
              onChange={(e) => setS({ ...s, welcome_message: e.target.value })}
              rows={3}
              placeholder="Shown to users when they open or refresh the home page."
              data-testid="setting-welcome-message"
              className="mt-2 w-full rounded-md bg-[#121E30] border border-[#1A2B44] text-white px-3 py-2 text-sm focus:outline-none focus:border-[#0055FF]/40"
            />
          </div>
        </div>

        <Button onClick={save} data-testid="setting-save-btn" className="bg-[#0055FF] hover:bg-[#3377FF]">Save</Button>
      </Card>

      {pn?.enabled && (
        <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl space-y-4">
          <div>
            <h2 className="font-display text-lg font-600">PayNow webhook URLs</h2>
            <p className="text-xs text-[#94A3B8] mt-1">Paste these in your PayNow merchant dashboard to enable auto-crediting and payout callbacks.</p>
          </div>
          {[
            ["Payin (deposit) callback URL", payinHook, "payin-webhook"],
            ["Payout (withdrawal) callback URL", payoutHook, "payout-webhook"],
          ].map(([label, url, tid]) => (
            <div key={label}>
              <Label>{label}</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input readOnly value={url} data-testid={tid}
                       className="bg-[#121E30] border-[#1A2B44] text-white h-11" />
                <Button variant="outline" onClick={() => copy(url)} className="border-[#1A2B44] bg-transparent text-white">
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
            </div>
          ))}
          <div className="text-xs text-[#94A3B8] pt-2 border-t border-[#1A2B44]">
            Configure a server IP whitelist in the PayNow dashboard for the payout, statement and balance endpoints (required by PayNow).
          </div>
        </Card>
      )}
    </div>
  );
}

