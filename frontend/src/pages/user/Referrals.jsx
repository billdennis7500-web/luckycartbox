import React, { useEffect, useMemo, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Users, TrendingUp, Check, MessageCircle, Send, Twitter, Facebook } from "lucide-react";
import { toast } from "sonner";
import LoadMore from "@/components/LoadMore";

export default function Referrals() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [gen, setGen] = useState("gen1");
  const [visible, setVisible] = useState(10);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/referrals").then((r) => setData(r.data));
  }, []);

  useEffect(() => {
    // reset pagination on tab change
    setVisible(10);
    setSearch("");
  }, [gen]);

  const currentTabUsers = useMemo(() => {
    if (!data) return [];
    if (gen === "gen1") return data.gen1;
    if (gen === "gen2") return data.gen2;
    return data.gen3;
  }, [data, gen]);

  const filteredUsers = useMemo(() => {
    if (!search) return currentTabUsers;
    const q = search.toLowerCase();
    return currentTabUsers.filter((u) => (u.name || "").toLowerCase().includes(q));
  }, [currentTabUsers, search]);

  if (!data) return <div className="text-[#94A3B8]">Loading…</div>;

  const link = `${window.location.origin}/register?ref=${data.referral_code}`;
  const shareText = `Join me on NaijaInvest — earn daily naira profits. Use my code ${data.referral_code} to sign up and grab a ₦500 welcome bonus.`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  };
  const copyCode = () => {
    navigator.clipboard.writeText(data.referral_code);
    toast.success("Code copied");
  };

  const shares = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      color: "bg-[#25D366]/15 text-[#25D366] border-[#25D366]/30",
      url: `https://wa.me/?text=${encodeURIComponent(shareText + " " + link)}`,
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: Send,
      color: "bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/30",
      url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      key: "twitter",
      label: "X",
      icon: Twitter,
      color: "bg-white/10 text-white border-white/20",
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`,
    },
    {
      key: "facebook",
      label: "Facebook",
      icon: Facebook,
      color: "bg-[#1877F2]/15 text-[#1877F2] border-[#1877F2]/30",
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
    },
  ];

  const tabs = [
    { key: "gen1", label: "Gen 1", pct: data.gen1_pct, users: data.gen1, earn: data.earnings.gen1 },
    { key: "gen2", label: "Gen 2", pct: data.gen2_pct, users: data.gen2, earn: data.earnings.gen2 },
    { key: "gen3", label: "Gen 3", pct: data.gen3_pct, users: data.gen3, earn: data.earnings.gen3 },
  ];
  const currentTab = tabs.find((t) => t.key === gen);

  const activeCount = currentTab.users.filter((u) => u.has_invested).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-800 tracking-tight" data-testid="referrals-heading">
          Refer & earn
        </h1>
        <p className="text-sm text-[#94A3B8] mt-1">3-generation commissions across every invite you make.</p>
      </div>

      {/* Hero card */}
      <Card
        data-testid="referral-hero-card"
        className="relative overflow-hidden rounded-2xl border border-[#1A2B44] bg-[#0B1524] p-6"
      >
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#0055FF]/25 blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-[#0055FF]/15 blur-[100px] pointer-events-none" />

        <div className="relative space-y-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#94A3B8]">Your referral code</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="font-display font-800 text-4xl sm:text-5xl tabular text-white" data-testid="referral-code">
                {data.referral_code}
              </div>
              <button
                onClick={copyCode}
                data-testid="copy-code-btn"
                className="w-9 h-9 rounded-full grid place-items-center border border-[#1A2B44] hover:border-[#0055FF]/40 hover:bg-[#121E30] transition-colors"
                title="Copy code"
              >
                <Copy className="w-3.5 h-3.5 text-[#94A3B8]" />
              </button>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#94A3B8] mb-2">Share link</div>
            <div className="rounded-lg border border-[#1A2B44] bg-[#020813] p-3 flex items-center gap-2 min-w-0">
              <span
                className="flex-1 min-w-0 text-xs sm:text-sm text-[#94A3B8] truncate tabular"
                title={link}
                data-testid="referral-link"
              >
                {link}
              </span>
              <button
                onClick={copyLink}
                data-testid="copy-link-btn"
                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#0055FF] hover:bg-[#3377FF] text-white text-xs font-medium transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#94A3B8] mb-2">Share via</div>
            <div className="grid grid-cols-4 gap-2">
              {shares.map((s) => (
                <a
                  key={s.key}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`share-${s.key}`}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border ${s.color} hover:scale-[1.02] transition-transform`}
                >
                  <s.icon className="w-4 h-4" />
                  <span className="text-[10px] font-medium">{s.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Total earnings */}
      <Card
        data-testid="total-earnings-card"
        className="rounded-2xl border border-[#0055FF]/40 bg-gradient-to-br from-[#0055FF] via-[#003ec7] to-[#0B1524] p-6 text-white"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/70">Total commissions</div>
            <div className="mt-2 font-display font-800 text-3xl sm:text-4xl tabular" data-testid="total-commissions">
              {formatNaira(data.earnings.total)}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-white/10 border border-white/20 grid place-items-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
          {tabs.map((t) => (
            <div key={t.key} className="rounded-lg bg-white/5 border border-white/10 p-3">
              <div className="text-white/70 uppercase tracking-wider text-[10px]">{t.label} · {t.pct}%</div>
              <div className="mt-1 tabular font-display font-800">{formatNaira(t.earn)}</div>
              <div className="mt-0.5 tabular text-white/70">{t.users.length} people</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Referral list with tabs + search + load more */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-600">Your network</h2>
          <div className="text-xs text-[#94A3B8]">
            <span className="text-[#10B981]">{activeCount}</span> / {currentTab.users.length} active
          </div>
        </div>

        <div
          data-testid="referral-tabs"
          className="grid grid-cols-3 rounded-lg border border-[#1A2B44] bg-[#0B1524] p-1 mb-3"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setGen(t.key)}
              data-testid={`gen-tab-${t.key}`}
              className={`py-2 rounded-md text-xs font-medium transition-colors ${
                gen === t.key
                  ? "bg-[#0055FF] text-white"
                  : "text-[#94A3B8] hover:text-white"
              }`}
            >
              {t.label} <span className="opacity-70">·</span> {t.pct}%
            </button>
          ))}
        </div>

        {currentTab.users.length > 5 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            data-testid="referral-search"
            className="w-full mb-3 h-10 px-3 rounded-md bg-[#121E30] border border-[#1A2B44] text-sm text-white placeholder:text-[#94A3B8]/60 focus:outline-none focus:border-[#0055FF]/50"
          />
        )}

        <Card className="rounded-xl border border-[#1A2B44] bg-[#0B1524] overflow-hidden">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#94A3B8]" data-testid={`no-${gen}`}>
              {search ? "No matches" : `No ${currentTab.label} referrals yet. Share your link to grow this generation.`}
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#1A2B44]">
                {filteredUsers.slice(0, visible).map((u, idx) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3" data-testid={`ref-user-${u.id}`}>
                    <div className="w-9 h-9 rounded-full bg-[#0055FF]/20 border border-[#0055FF]/40 grid place-items-center text-xs font-display font-800">
                      {(u.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-xs text-[#94A3B8] tabular truncate">{u.phone}</div>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${
                        u.has_invested
                          ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                          : "bg-[#1A2B44] text-[#94A3B8] border-[#1A2B44]"
                      }`}
                    >
                      {u.has_invested ? "Active" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
              <LoadMore
                shown={Math.min(visible, filteredUsers.length)}
                total={filteredUsers.length}
                onMore={setVisible}
                testid={`load-more-${gen}`}
              />
            </>
          )}
        </Card>

        {currentTab.users.length === 0 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#94A3B8]">
            <Users className="w-3 h-3" />
            Every invite earns you {currentTab.pct}% forever.
          </div>
        )}
      </section>
    </div>
  );
}
