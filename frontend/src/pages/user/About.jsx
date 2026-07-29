/**
 * About — /about
 *
 * Static About Us page. Uses the same dark-gold ambient styling as the rest
 * of the app. Contact button links back to the Customer Service page.
 */
import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, TrendingUp, ShieldCheck, Zap, Users, Headphones, ExternalLink } from "lucide-react";
import { SectionHeader, SoftCard, MicroLabel } from "@/components/design";

const VALUES = [
  { icon: TrendingUp,  color: "#10B981", title: "Daily returns you can see",
    text: "Every product pays profit every 24 hours — no black-box fund, no hidden lockups. Buy today, earn tomorrow." },
  { icon: Zap,         color: "#F5C518", title: "Instant Nigerian payouts",
    text: "Withdrawals hit your bank in minutes through four regulated payment gateways. No manual approvals delaying your money." },
  { icon: ShieldCheck, color: "#0055FF", title: "Bank-grade security",
    text: "All balances live in an encrypted ledger, all transfers are IP-locked to a single static server IP, and every signature is verified before we credit or debit a naira." },
  { icon: Users,       color: "#A855F7", title: "Grow with your team",
    text: "3-generation referral commissions mean every friend you invite keeps rewarding you as their own team grows." },
];

export default function About() {
  return (
    <div className="space-y-5">
      <Link to="/profile" data-testid="about-back"
            className="inline-flex items-center gap-1 text-xs text-[var(--nb-muted)] hover:text-white transition-colors">
        <ArrowLeft className="w-3 h-3" /> Back to profile
      </Link>

      {/* Hero */}
      <div
        className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-6 text-center"
        style={{ boxShadow: "0 10px 32px -10px rgba(245,197,24,0.45), 0 0 0 1px rgba(245,197,24,0.30)" }}
        data-testid="about-hero"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
             style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.7 }} />
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20 blur-2xl pointer-events-none"
             style={{ background: "#F5C518" }} />

        <div
          className="mx-auto w-16 h-16 rounded-2xl grid place-items-center mb-3"
          style={{
            background: "linear-gradient(135deg,#FFE580,#F5C518)",
            color: "#1A1508",
            boxShadow: "0 8px 22px rgba(245,197,24,0.55)",
          }}
        >
          <TrendingUp className="w-8 h-8" strokeWidth={2.4} />
        </div>
        <div className="relative">
          <MicroLabel tone="gold" className="!mt-0 justify-center">About</MicroLabel>
          <div className="font-display font-800 text-2xl text-white mt-1">NaijaInvest</div>
          <div className="text-xs text-[var(--nb-muted)] mt-1">
            Nigeria's trusted daily-earning investment platform
          </div>
        </div>
      </div>

      {/* Mission */}
      <SoftCard testid="about-mission">
        <MicroLabel tone="gold">Our mission</MicroLabel>
        <div className="mt-2 text-sm text-white font-display font-700 leading-relaxed">
          Put daily-earning investments within reach of every Nigerian — without hidden fees, without confusing jargon, and without waiting weeks for a payout.
        </div>
        <div className="mt-3 text-xs text-[var(--nb-muted)] leading-relaxed">
          We built NaijaInvest for the trader in Balogun, the freelancer in Yaba, and the student in Zaria alike. If you can operate a bank app, you can grow your money here.
        </div>
      </SoftCard>

      {/* Why NaijaInvest */}
      <SectionHeader title="Why NaijaInvest" />
      <div className="space-y-3">
        {VALUES.map((v) => {
          const Icon = v.icon;
          return (
            <div
              key={v.title}
              data-testid={`about-value-${v.title.split(" ")[0].toLowerCase()}`}
              className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-4 flex items-start gap-3"
              style={{ boxShadow: `0 4px 16px -6px ${v.color}55, 0 0 0 1px ${v.color}25` }}
            >
              <div
                className="w-11 h-11 rounded-xl grid place-items-center shrink-0"
                style={{
                  background: `${v.color}18`,
                  border: `1px solid ${v.color}40`,
                  color: v.color,
                }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-800 text-white text-sm">{v.title}</div>
                <div className="text-xs text-[var(--nb-muted)] leading-relaxed mt-0.5">{v.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Version + contact */}
      <SoftCard testid="about-meta">
        <div className="flex items-center justify-between">
          <div>
            <MicroLabel tone="gold" className="!mt-0">Version</MicroLabel>
            <div className="text-sm text-white font-display font-700 mt-0.5 tabular">v1.0.0 · 2026</div>
          </div>
          <Link
            to="/customer-service"
            data-testid="about-contact-cta"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-display font-800 transition-all hover:brightness-110 active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg,#10B981,#059669)",
              color: "#FFFFFF",
              boxShadow: "0 6px 18px rgba(16,185,129,0.45)",
            }}
          >
            <Headphones className="w-3 h-3" /> Contact us
          </Link>
        </div>
      </SoftCard>

      {/* Legal footer */}
      <div className="text-center text-[10px] text-[var(--nb-muted)] pb-4 leading-relaxed">
        © {new Date().getFullYear()} NaijaInvest. All rights reserved.
        <br />
        Investments carry risk. Past returns do not guarantee future performance.
      </div>
    </div>
  );
}
