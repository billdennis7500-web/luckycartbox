import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira } from "@/lib/api";
import useSWRCache from "@/lib/useSWRCache";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Users, TrendingUp, Check, MessageCircle, Send, Twitter, Facebook, Sparkles, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import LoadMore from "@/components/LoadMore";
import { AmbientCard, SectionHeader, MicroLabel } from "@/components/design";

export default function Referrals() {
  const { data } = useSWRCache("referrals", () => api.get("/referrals").then((r) => r.data));
  const [copied, setCopied] = useState(false);
  const [gen, setGen] = useState("gen1");
  const [visible, setVisible] = useState(10);
  const [search, setSearch] = useState("");

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

  if (!data) return (
    <div className="space-y-4" data-testid="referrals-skeleton">
      <div className="animate-pulse rounded-2xl bg-[var(--nb-card)] h-24"
           style={{ boxShadow: "0 6px 24px -8px rgba(245,197,24,0.20), 0 0 0 1px rgba(245,197,24,0.10)" }} />
      <div className="grid grid-cols-3 gap-2">
        <div className="animate-pulse rounded-xl h-16 bg-[var(--nb-card)]" />
        <div className="animate-pulse rounded-xl h-16 bg-[var(--nb-card)]" />
        <div className="animate-pulse rounded-xl h-16 bg-[var(--nb-card)]" />
      </div>
      <div className="space-y-2">
        <div className="animate-pulse rounded-lg h-14 bg-[var(--nb-card)]" />
        <div className="animate-pulse rounded-lg h-14 bg-[var(--nb-card)]" />
        <div className="animate-pulse rounded-lg h-14 bg-[var(--nb-card)]" />
      </div>
    </div>
  );

  const link = `${window.location.origin}/register?ref=${data.referral_code}`;
  const shareText = `Join me on Luckycart Box — earn daily naira profits. Use my code ${data.referral_code} to sign up and grab a ₦500 welcome bonus.`;

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
      <SectionHeader
        title="Refer & earn"
        subtitle="3-generation commissions across every invite you make."
        testid="referrals-heading"
      />

      {/* Promo page CTA — shareable poster for WhatsApp/Telegram blast */}
      <Link
        to="/rewards-showcase"
        data-testid="referrals-promo-cta"
        className="block relative rounded-2xl overflow-hidden active:scale-[0.99] transition"
        style={{
          background: "linear-gradient(135deg,#1E1B0A 0%,#0B0906 65%,#050403 100%)",
          border: "1px solid rgba(245,197,24,0.55)",
          boxShadow: "0 12px 28px -10px rgba(245,197,24,0.5)",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-[2px]"
             style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.85 }} />
        <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-45 blur-3xl"
             style={{ background: "radial-gradient(circle,#F5C518 0%,transparent 70%)" }} />

        <div className="relative p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl shrink-0 grid place-items-center"
               style={{
                 background: "linear-gradient(135deg,#FFE580,#F5C518)",
                 boxShadow: "0 6px 14px -4px rgba(245,197,24,0.65)",
               }}>
            <Sparkles className="w-5 h-5 text-[#1A1508]" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest font-display font-800 text-[#F5C518]">
              Shareable Poster
            </div>
            <div className="text-white font-display font-800 text-sm leading-tight mt-0.5">
              Spread the wealth &amp; get paid — up to ₦72,000 in stacked bonuses
            </div>
            <div className="text-[11px] text-[var(--nb-muted)] mt-1">
              Tap to open the shareable rewards poster → blast on WhatsApp status &amp; Telegram
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#F5C518] shrink-0" />
        </div>
      </Link>

      {/* Reward levels action card — links to the milestone-bonuses page.
          Uses var(--nb-card) so it flips white in light-mode; gold accents
          + medallion carry the identity in both themes. */}
      <Link
        to="/rewards"
        data-testid="referrals-rewards-cta"
        className="group relative block rounded-2xl overflow-hidden p-4 sm:p-5 bg-[var(--nb-card)]"
        style={{
          border: "1px solid rgba(245,197,24,0.45)",
          boxShadow:
            "0 10px 32px -12px rgba(245,197,24,0.45), inset 0 0 0 1px rgba(255,229,128,0.10)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            background: "linear-gradient(135deg, rgba(245,197,24,0.10) 0%, rgba(245,197,24,0.04) 55%, rgba(245,197,24,0) 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute -top-16 -right-10 w-56 h-56 rounded-full opacity-40 pointer-events-none blur-2xl"
          style={{ background: "radial-gradient(closest-side,#F5C518,transparent)" }}
        />
        <div className="relative flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl grid place-items-center shrink-0"
            style={{
              background:
                "linear-gradient(135deg,#FFE580 0%,#F5C518 60%,#C99700 100%)",
              boxShadow: "0 8px 20px rgba(245,197,24,0.55)",
              color: "#1A1508",
            }}
          >
            <Sparkles className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <MicroLabel tone="gold" className="!mt-0">Milestone bonuses</MicroLabel>
            <div className="mt-0.5 font-display font-800 text-lg text-white truncate">Referral Reward Levels</div>
            <div className="text-xs text-[var(--nb-muted)] truncate">
              Unlock Ignite → Titan with each new active friend. Tap to see your progress.
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-full grid place-items-center shrink-0 border border-[rgba(245,197,24,0.4)] text-[#F5C518] group-hover:bg-[rgba(245,197,24,0.15)] transition-colors"
            aria-hidden
          >
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </Link>

      {/* Hero card — purple/epic tone */}
      <AmbientCard tone="epic" testid="referral-hero-card">

        <div className="relative space-y-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--nb-muted)]">Your referral code</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="font-display font-800 text-4xl sm:text-5xl tabular text-white" data-testid="referral-code">
                {data.referral_code}
              </div>
              <button
                onClick={copyCode}
                data-testid="copy-code-btn"
                className="w-9 h-9 rounded-full grid place-items-center border border-[var(--nb-border)] hover:border-[#0055FF]/40 hover:bg-[var(--nb-card2)] transition-colors"
                title="Copy code"
              >
                <Copy className="w-3.5 h-3.5 text-[var(--nb-muted)]" />
              </button>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--nb-muted)] mb-2">Share link</div>
            <div className="rounded-lg border border-[var(--nb-border)] bg-[var(--nb-page)] p-3 flex items-center gap-2 min-w-0">
              <span
                className="flex-1 min-w-0 text-xs sm:text-sm text-[var(--nb-muted)] truncate tabular"
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
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--nb-muted)] mb-2">Share via</div>
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
      </AmbientCard>

      {/* Total earnings — gold tone */}
      <AmbientCard tone="gold" testid="total-earnings-card">
        <div className="flex items-start justify-between">
          <div>
            <MicroLabel tone="gold">Total commissions</MicroLabel>
            <div className="mt-2 font-display font-800 text-3xl sm:text-4xl tabular text-white" data-testid="total-commissions">
              {formatNaira(data.earnings.total)}
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl grid place-items-center"
               style={{ background: "linear-gradient(135deg,#FFE580,#F5C518)",
                        boxShadow: "0 6px 20px rgba(245,197,24,0.45)" }}>
            <TrendingUp className="w-5 h-5 text-[#1A1508]" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
          {tabs.map((t) => (
            <div key={t.key} className="rounded-lg p-3"
                 style={{ background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.28)" }}>
              <div className="uppercase tracking-wider text-[10px]" style={{ color: "#F5C518", opacity: 0.85 }}>
                {t.label} · {t.pct}%
              </div>
              <div className="mt-1 tabular font-display font-800 text-white">{formatNaira(t.earn)}</div>
              <div className="mt-0.5 tabular text-[var(--nb-muted)]">{t.users.length} people</div>
            </div>
          ))}
        </div>
      </AmbientCard>

      {/* Referral list with tabs + search + load more */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 rounded-sm bg-[#A855F7]" />
            <h2 className="font-display text-lg font-800 tracking-tight text-white">Your network</h2>
          </div>
          <div className="text-xs text-[var(--nb-muted)]">
            <span className="text-[#10B981] font-display font-700">{activeCount}</span>
            <span className="mx-1">/</span>
            <span className="tabular">{currentTab.users.length}</span> active
          </div>
        </div>

        <div
          data-testid="referral-tabs"
          className="grid grid-cols-3 rounded-full border border-[#A855F7]/25 bg-[var(--nb-card)] p-1 mb-3"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setGen(t.key)}
              data-testid={`gen-tab-${t.key}`}
              className={`py-2 rounded-full text-xs font-display font-700 transition-all ${
                gen === t.key
                  ? "text-white shadow-lg"
                  : "text-[var(--nb-muted)] hover:text-white"
              }`}
              style={gen === t.key ? {
                background: "linear-gradient(135deg,#A855F7,#7C3AED)",
                boxShadow: "0 6px 18px -4px rgba(124,58,237,0.55)",
              } : {}}
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
            className="w-full mb-3 h-10 px-3 rounded-full bg-[var(--nb-card2)] border border-[#A855F7]/25 text-sm text-white placeholder:text-[var(--nb-muted)]/60 focus:outline-none focus:border-[#A855F7]/60"
          />
        )}

        {/* Network list — dark-gold ambient container with dashed gold accent lines */}
        {filteredUsers.length === 0 ? (
          <div className="relative rounded-2xl overflow-hidden"
               style={{ boxShadow: "0 6px 24px -8px #F5C51844, 0 0 0 1px #F5C51820" }}>
            <div className="absolute inset-x-0 top-0 h-[2px] z-10 pointer-events-none"
                 style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 8px,transparent 8px 14px)", opacity: 0.55 }} />
            <div className="absolute inset-x-0 bottom-0 h-[2px] z-10 pointer-events-none"
                 style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 8px,transparent 8px 14px)", opacity: 0.55 }} />
            <div className="relative p-8 text-center bg-[var(--nb-card)]"
                 data-testid={`no-${gen}`}>
              <div className="mx-auto w-12 h-12 rounded-2xl grid place-items-center mb-2"
                   style={{ background: "linear-gradient(135deg,#FFE580,#F5C518)",
                            boxShadow: "0 4px 20px rgba(245,197,24,0.35)" }}>
                <Users className="w-5 h-5 text-[#1A1508]" />
              </div>
              <div className="text-sm text-[var(--nb-muted)]">
                {search ? "No matches" : `No ${currentTab.label} referrals yet. Share your link to grow this generation.`}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2.5" data-testid="referral-list">
              {filteredUsers.slice(0, visible).map((u) => (
                <div
                  key={u.id}
                  data-testid={`ref-user-${u.id}`}
                  className="relative rounded-xl overflow-hidden"
                  style={{ boxShadow: `0 4px 18px -6px ${u.has_invested ? "#10B98155" : "#F5C51833"}, 0 0 0 1px ${u.has_invested ? "#10B98130" : "#F5C51820"}` }}
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] z-10 pointer-events-none"
                       style={{ background: `repeating-linear-gradient(90deg,${u.has_invested ? "#10B981" : "#F5C518"} 0 8px,transparent 8px 14px)`, opacity: 0.5 }} />
                  <div className="relative flex items-center gap-3 px-4 py-3 bg-[var(--nb-card)]">
                    <div
                      className="w-10 h-10 rounded-xl grid place-items-center text-sm font-display font-800 shrink-0"
                      style={{
                        background: u.has_invested
                          ? "linear-gradient(135deg,#10B981,#065F46)"
                          : "linear-gradient(135deg,#FFE580,#F5C518)",
                        color: u.has_invested ? "#FFFFFF" : "#1A1508",
                        boxShadow: u.has_invested
                          ? "0 4px 14px rgba(16,185,129,0.45)"
                          : "0 4px 14px rgba(245,197,24,0.45)",
                      }}
                    >
                      {(u.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-display font-700 text-white truncate">{u.name}</div>
                      <div className="text-[11px] text-[var(--nb-muted)] tabular truncate">{u.phone}</div>
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-display font-700 uppercase tracking-wider px-2 py-1 rounded-full"
                      style={u.has_invested ? {
                        background: "#10B98118",
                        color: "#10B981",
                        border: "1px solid #10B98140",
                      } : {
                        background: "#F5C51818",
                        color: "#F5C518",
                        border: "1px solid #F5C51840",
                      }}
                    >
                      {u.has_invested ? "Active" : "Pending"}
                    </span>
                  </div>
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

        {currentTab.users.length === 0 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--nb-muted)]">
            <Users className="w-3 h-3" />
            Every invite earns you {currentTab.pct}% forever.
          </div>
        )}
      </section>
    </div>
  );
}
