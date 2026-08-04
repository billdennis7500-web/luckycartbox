/**
 * CustomerService — /customer-service
 *
 * Rebuilt to match the reference screenshot: header with "How can we help?",
 * three big channel cards (WhatsApp, Telegram DM, Telegram Channel), a
 * working-hours strip, and an accordion FAQ.
 *
 * Channel URLs come from the settings/public endpoint (admin-configurable):
 *   • whatsapp_url        — full wa.me link
 *   • telegram_url        — DM support link
 *   • telegram_channel_url — announcements channel
 * If any URL is missing the card renders a "not configured yet" hint.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, MessageCircle, Send, Megaphone, Clock, ChevronDown, LifeBuoy } from "lucide-react";
import { SectionHeader, SoftCard, MicroLabel } from "@/components/design";

const CHANNEL_TONE = {
  whatsapp:      { color: "#25D366", icon: MessageCircle, label: "WhatsApp",         sub: "Real-time private chat" },
  wachannel:     { color: "#128C7E", icon: Megaphone,     label: "WhatsApp Channel", sub: "Broadcast updates" },
  telegram:      { color: "#3AABE0", icon: Send,          label: "Telegram Support", sub: "Direct message our team" },
  channel:       { color: "#F5C518", icon: Megaphone,     label: "Telegram Channel", sub: "Announcements & tips" },
};

function ChannelCard({ tone, url, testid }) {
  const t = CHANNEL_TONE[tone];
  const Icon = t.icon;
  const disabled = !url;
  const Wrapper = disabled ? "div" : "a";
  const wrapperProps = disabled ? {} : { href: url, target: "_blank", rel: "noreferrer" };
  return (
    <Wrapper
      data-testid={testid}
      {...wrapperProps}
      className={`relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-4 flex items-center gap-4 transition-transform ${disabled ? "opacity-60" : "hover:brightness-110 active:scale-[0.98]"}`}
      style={{ boxShadow: `0 6px 24px -8px ${t.color}66, 0 0 0 1px ${t.color}30` }}
    >
      <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
           style={{ background: `repeating-linear-gradient(90deg,${t.color} 0 8px,transparent 8px 14px)`, opacity: 0.65 }} />
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20 blur-2xl pointer-events-none"
           style={{ background: t.color }} />

      <div
        className="w-14 h-14 rounded-2xl grid place-items-center shrink-0"
        style={{
          background: `linear-gradient(135deg,${t.color},${t.color}CC)`,
          color: t.color === "#F5C518" ? "#1A1508" : "#FFFFFF",
          boxShadow: `0 6px 18px ${t.color}55`,
        }}
      >
        <Icon className="w-6 h-6" strokeWidth={2.4} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-800 text-white text-base truncate">{t.label}</div>
        <div className="text-xs text-[var(--nb-muted)] truncate">{t.sub}</div>
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-display font-800 uppercase tracking-widest"
             style={{ color: t.color }}>
          {disabled ? "Not configured yet" : "Open"}
          {!disabled && <span aria-hidden>›</span>}
        </div>
      </div>
    </Wrapper>
  );
}

const FAQ = [
  {
    q: "How long does a deposit take?",
    a: "Deposits made via Instant Pay, Quick Pay, Fast Pay or Smart Pay are auto-credited within seconds once your bank confirms the transfer. Manual bank deposits typically clear within 15–30 minutes on business days.",
  },
  {
    q: "How do I withdraw my earnings?",
    a: "Tap the Withdraw button on your Dashboard or Profile page, enter the amount, and confirm. Withdrawals to Nigerian banks are routed automatically through our fastest available gateway. You must have made at least one purchase before your first withdrawal.",
  },
  {
    q: "When are daily profits paid?",
    a: "Every product you buy pays daily profit every 24 hours from the moment of purchase. Profits land in your Balance automatically — you don't need to claim them manually.",
  },
  {
    q: "How do referral commissions work?",
    a: "You earn on 3 generations: Gen 1 (direct invites) pays the highest %, Gen 2 (their invites) pays a smaller %, Gen 3 (their invites' invites) pays a smaller % again. Commission rates are visible on your Team page.",
  },
  {
    q: "I paid but my wallet wasn't credited — what do I do?",
    a: "First check your Deposit history — if it's still Pending, the gateway is still processing (usually resolves within 5 minutes). If it's Rejected, contact Customer Service with the transaction reference and screenshot of your bank alert.",
  },
];

function FaqItem({ q, a, testid }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--nb-border)] last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid={testid}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--nb-card2)] transition-colors"
      >
        <div className="flex-1 text-sm font-display font-700 text-white pr-2">{q}</div>
        <ChevronDown
          className={`w-4 h-4 text-[var(--nb-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 text-xs text-[var(--nb-muted)] leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
}

export default function CustomerService() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    api.get("/settings/public").then((r) => setSettings(r.data || {})).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link to="/profile" data-testid="cs-back"
            className="inline-flex items-center gap-1 text-xs text-[var(--nb-muted)] hover:text-white transition-colors">
        <ArrowLeft className="w-3 h-3" /> Back to profile
      </Link>

      {/* Header — gold ambient */}
      <div
        className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-5 text-center"
        style={{ boxShadow: "0 10px 30px -10px rgba(245,197,24,0.45), 0 0 0 1px rgba(245,197,24,0.30)" }}
        data-testid="cs-hero"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
             style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.7 }} />
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-25 blur-2xl pointer-events-none"
             style={{ background: "#F5C518" }} />
        <div
          className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-3"
          style={{
            background: "linear-gradient(135deg,#FFE580,#F5C518)",
            color: "#1A1508",
            boxShadow: "0 8px 22px rgba(245,197,24,0.55)",
          }}
        >
          <LifeBuoy className="w-7 h-7" strokeWidth={2.4} />
        </div>
        <div className="relative">
          <MicroLabel tone="gold" className="!mt-0 justify-center">Support</MicroLabel>
          <div className="font-display font-800 text-xl text-white mt-1">
            How can we help?
          </div>
          <div className="text-xs text-[var(--nb-muted)] mt-1">
            Reach us on any channel below — we usually reply within an hour.
          </div>
        </div>
      </div>

      {/* Channels */}
      <SectionHeader title="Contact channels" />
      <div className="space-y-3">
        <ChannelCard tone="whatsapp"  url={settings.whatsapp_url}          testid="cs-whatsapp" />
        <ChannelCard tone="wachannel" url={settings.whatsapp_channel_url}  testid="cs-whatsapp-channel" />
        <ChannelCard tone="telegram"  url={settings.telegram_url}          testid="cs-telegram" />
        <ChannelCard tone="channel"   url={settings.telegram_channel_url}  testid="cs-channel" />
      </div>

      {/* Working hours */}
      <div
        className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-4 flex items-center gap-3"
        style={{ boxShadow: "0 4px 16px -6px rgba(16,185,129,0.35), 0 0 0 1px rgba(16,185,129,0.30)" }}
        data-testid="cs-hours"
      >
        <div className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
             style={{ background: "#10B98118", border: "1px solid #10B98140", color: "#10B981" }}>
          <Clock className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <MicroLabel tone="green" className="!mt-0">Working hours</MicroLabel>
          <div className="text-sm text-white font-display font-700 mt-0.5">
            {settings.support_hours || "Monday to Sunday, 10:00 AM to 5:00 PM"}
          </div>
        </div>
      </div>

      {/* FAQ */}
      <SectionHeader title="Frequently asked" />
      <SoftCard padded={false} testid="cs-faq">
        {FAQ.map((f, i) => (
          <FaqItem key={i} q={f.q} a={f.a} testid={`faq-item-${i}`} />
        ))}
      </SoftCard>
    </div>
  );
}
