import React, { useEffect, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Users } from "lucide-react";
import { toast } from "sonner";

export default function Referrals() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/referrals").then((r) => setData(r.data)); }, []);

  if (!data) return <div className="text-[#94A3B8]">Loading…</div>;

  const link = `${window.location.origin}/register?ref=${data.referral_code}`;
  const copyLink = () => { navigator.clipboard.writeText(link); toast.success("Referral link copied"); };
  const copyCode = () => { navigator.clipboard.writeText(data.referral_code); toast.success("Code copied"); };

  const tabs = [
    { key: "gen1", label: "Gen 1", pct: data.gen1_pct, users: data.gen1, earn: data.earnings.gen1 },
    { key: "gen2", label: "Gen 2", pct: data.gen2_pct, users: data.gen2, earn: data.earnings.gen2 },
    { key: "gen3", label: "Gen 3", pct: data.gen3_pct, users: data.gen3, earn: data.earnings.gen3 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="referrals-heading">Referral network</h1>
        <p className="text-[#94A3B8] mt-2">Every investment across 3 generations pays into your wallet.</p>
      </div>

      <Card className="bg-[#0B1524] border-[#1A2B44] p-6 rounded-xl">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Your referral code</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="font-display font-800 text-3xl tabular" data-testid="referral-code">{data.referral_code}</div>
              <Button variant="outline" size="sm" onClick={copyCode} data-testid="copy-code-btn"
                      className="border-[#1A2B44] bg-transparent text-white"><Copy className="w-3 h-3 mr-1" />Copy</Button>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Share link</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 truncate rounded-md border border-[#1A2B44] bg-[#121E30] px-3 py-2 text-sm" data-testid="referral-link">{link}</div>
              <Button onClick={copyLink} data-testid="copy-link-btn" className="bg-[#0055FF] hover:bg-[#3377FF]"><Share2 className="w-3 h-3 mr-1" />Share</Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-4 gap-4">
        <Card className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-xl">
          <div className="text-xs text-[#94A3B8] uppercase tracking-widest">Total commissions</div>
          <div className="mt-2 font-display font-800 text-2xl tabular text-[#10B981]" data-testid="total-commissions">{formatNaira(data.earnings.total)}</div>
        </Card>
        {tabs.map((t) => (
          <Card key={t.key} className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-xl" data-testid={`gen-card-${t.key}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs text-[#94A3B8] uppercase tracking-widest">{t.label} · {t.pct}%</div>
              <Users className="w-4 h-4 text-[#0055FF]" />
            </div>
            <div className="mt-2 font-display font-800 text-2xl tabular">{t.users.length}</div>
            <div className="mt-1 text-sm tabular text-[#10B981]">{formatNaira(t.earn)}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {tabs.map((t) => (
          <Card key={t.key} className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1A2B44] flex items-center justify-between">
              <div className="font-display font-600">{t.label}</div>
              <span className="text-xs text-[#0055FF]">{t.pct}% commission</span>
            </div>
            <div className="divide-y divide-[#1A2B44] max-h-80 overflow-auto">
              {t.users.length === 0 ? (
                <div className="p-6 text-center text-sm text-[#94A3B8]" data-testid={`no-${t.key}`}>No referrals yet.</div>
              ) : t.users.map((u) => (
                <div key={u.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <div>{u.name}</div>
                    <div className="text-xs text-[#94A3B8]">{u.phone}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${u.has_invested ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30" : "bg-[#1A2B44] text-[#94A3B8]"}`}>
                    {u.has_invested ? "Active" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
