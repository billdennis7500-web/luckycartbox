import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatNaira } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowDownToLine, ArrowUpFromLine, Ticket, Sparkles, Gift, TrendingUp, Wallet,
  Eye, EyeOff, Copy, Send, PartyPopper, Coins, Trophy, Flame, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  AmbientCard, SoftCard, SectionHeader, MicroLabel, StackChip, StatChip, PillCTA,
} from "@/components/design";
import InstallAppTile from "@/components/InstallAppTile";

function ActionTile({ to, icon: Icon, label, tone, testid }) {
  const tones = {
    green:  { g: "#10B981" },
    blue:   { g: "#0055FF" },
    amber:  { g: "#F5C518" },
    violet: { g: "#7C3AED" },
  };
  const t = tones[tone] || tones.blue;
  return (
    <Link to={to} data-testid={testid} className="block">
      <div
        className="relative rounded-xl overflow-hidden card-hover"
        style={{ boxShadow: `0 4px 18px -6px ${t.g}55, 0 0 0 1px ${t.g}25` }}
      >
        <div
          className="relative p-3 flex flex-col items-center justify-center gap-2 min-h-[92px] bg-[var(--nb-card)]"
        >
          <div
            className="w-10 h-10 rounded-lg grid place-items-center"
            style={{ background: `${t.g}22`, border: `1px solid ${t.g}55`, color: t.g }}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="text-[11px] font-display font-700 text-white text-center">
            {label}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [settings, setSettings] = useState({ telegram_url: "", welcome_message: "", site_name: "Luckycart Box" });
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    refresh();
    api.get("/settings/public")
      .then((r) => { setSettings(r.data || {}); setWelcomeOpen(true); })
      .catch(() => setWelcomeOpen(true));
  }, []); // eslint-disable-line

  const copyCode = async () => {
    if (!user?.referral_code) return;
    try {
      await navigator.clipboard.writeText(user.referral_code);
      toast.success("Referral code copied");
    } catch { toast.error("Clipboard blocked — copy manually"); }
  };

  const tg = (settings.telegram_url || "").trim();
  const brand = settings.site_name || "Luckycart Box";
  const welcomeMsg = (settings.welcome_message || "").trim() ||
    `Welcome to ${brand} — grow your money the smart way. Invest today, cash out tomorrow.`;

  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      {/* Greeting + Telegram chip */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <MicroLabel>Welcome back</MicroLabel>
          <h1 className="font-display text-2xl font-800 tracking-tight mt-1 text-white" data-testid="dashboard-heading">
            Hi, {firstName} <span className="inline-block">👋</span>
          </h1>
        </div>
        {tg && (
          <a
            href={tg}
            target="_blank"
            rel="noreferrer"
            data-testid="dashboard-telegram-chip"
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#229ED9]/40 bg-[#229ED9]/10 text-[#229ED9] text-xs font-medium hover:bg-[#229ED9]/20 transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Telegram
          </a>
        )}
      </div>

      {/* Wallet hero card — the flagship dark-gold ambient card */}
      <AmbientCard tone="gold" testid="wallet-card">
        <div className="relative">
          {/* Corner shimmer */}
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full pointer-events-none"
               style={{ background: "radial-gradient(circle,#F5C51833,transparent 70%)" }} />

          <div className="flex items-center justify-between">
            <StatChip icon={Wallet} label="Wallet" value="Live" tone="gold" testid="wallet-live-chip" />
            <button
              onClick={() => setHidden((v) => !v)}
              data-testid="wallet-hide-toggle"
              className="text-[#F5C518]/70 hover:text-[#F5C518] transition-colors"
              aria-label="Toggle wallet visibility"
            >
              {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-4">
            <MicroLabel tone="gold">Wallet balance</MicroLabel>
            <div
              className="mt-1 font-display font-800 text-4xl sm:text-5xl tabular text-white tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
              data-testid="wallet-amount"
            >
              {hidden ? "₦ • • • • •" : formatNaira(user?.wallet_balance)}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg p-3 backdrop-blur-sm"
                 style={{ background: "rgba(245,197,24,0.06)", border: "1px solid rgba(245,197,24,0.18)" }}>
              <MicroLabel tone="gold">Bonus</MicroLabel>
              <div className="mt-1 font-display font-700 tabular text-white text-sm truncate">
                {hidden ? "···" : formatNaira(user?.bonus_balance)}
              </div>
            </div>
            <div className="rounded-lg p-3 backdrop-blur-sm"
                 style={{ background: "rgba(0,85,255,0.08)", border: "1px solid rgba(0,85,255,0.22)" }}>
              <MicroLabel><span className="text-[#0055FF]">Invested</span></MicroLabel>
              <div className="mt-1 font-display font-700 tabular text-white text-sm truncate">
                {hidden ? "···" : formatNaira(user?.total_invested)}
              </div>
            </div>
            <div className="rounded-lg p-3 backdrop-blur-sm"
                 style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.22)" }}>
              <MicroLabel><span className="text-[#10B981]">Earned</span></MicroLabel>
              <div className="mt-1 font-display font-700 tabular text-white text-sm truncate">
                {hidden ? "···" : formatNaira(user?.total_earned)}
              </div>
            </div>
          </div>
        </div>
      </AmbientCard>

      {/* Quick actions */}
      <section>
        <MicroLabel className="mb-3">Quick actions</MicroLabel>
        <div className="grid grid-cols-4 gap-3" data-testid="quick-actions-grid">
          <ActionTile to="/deposit"     icon={ArrowDownToLine} label="Deposit"  tone="green"  testid="quick-deposit-link" />
          <ActionTile to="/withdraw"    icon={ArrowUpFromLine} label="Withdraw" tone="blue"   testid="quick-withdraw-link" />
          <ActionTile to="/coupon"      icon={Ticket}          label="Redeem"   tone="amber"  testid="quick-redeem-link" />
          <InstallAppTile />
        </div>
      </section>

      {/* Not-invested nudge — gets tier-hot glow to nudge action */}
      {!user?.has_invested && (
        <AmbientCard tone="hot" testid="not-invested-banner" padded>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl grid place-items-center"
                 style={{ background: "#F5C51818", border: "1px solid #F5C51840", color: "#F5C518" }}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-800 text-white text-base">
                You have {formatNaira(settings.welcome_bonus || 500)} welcome bonus
              </div>
              <div className="text-xs text-[var(--nb-muted)] mt-1 leading-relaxed">
                Buy any product to unlock withdrawals, referral commissions and coupon redemptions.
              </div>
              <Link to="/marketplace" data-testid="unlock-bonus-cta" className="inline-block mt-3">
                <PillCTA tone="purple" size="sm" icon={TrendingUp} testid="unlock-bonus-btn">
                  Buy now
                </PillCTA>
              </Link>
            </div>
          </div>
        </AmbientCard>
      )}

      {/* Referral card */}
      <AmbientCard tone="epic" testid="dashboard-ref-card">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl grid place-items-center shrink-0"
               style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)",
                        boxShadow: "0 6px 20px rgba(168,85,247,0.45)" }}>
            <Gift className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <MicroLabel tone="epic">Your referral code</MicroLabel>
            <div
              className="mt-1 font-display font-800 text-2xl tabular text-white tracking-wider truncate"
              data-testid="dashboard-ref-code"
            >
              {user?.referral_code || "—"}
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={copyCode}
            data-testid="dashboard-copy-ref"
            className="flex-1 border-[#A855F7]/40 bg-[#A855F7]/10 text-[#A855F7] hover:bg-[#A855F7]/20 h-10 rounded-lg"
          >
            <Copy className="w-3.5 h-3.5 mr-1" /> Copy code
          </Button>
          <Link to="/referrals" data-testid="dashboard-referrals-link" className="flex-1">
            <PillCTA
              tone="purple"
              size="sm"
              icon={Gift}
              className="w-full"
              testid="dashboard-invite-btn"
            >
              Invite & earn
            </PillCTA>
          </Link>
        </div>
      </AmbientCard>

      {/* Small trust row */}
      <SoftCard testid="dashboard-trust-row">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="mx-auto w-9 h-9 rounded-lg grid place-items-center"
                 style={{ background: "#F5C51818", color: "#F5C518", border: "1px solid #F5C51840" }}>
              <Coins className="w-4 h-4" />
            </div>
            <div className="mt-1.5 text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Daily</div>
            <div className="text-[11px] font-display font-700 text-white">Auto payout</div>
          </div>
          <div>
            <div className="mx-auto w-9 h-9 rounded-lg grid place-items-center"
                 style={{ background: "#10B98118", color: "#10B981", border: "1px solid #10B98140" }}>
              <Trophy className="w-4 h-4" />
            </div>
            <div className="mt-1.5 text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">Secure</div>
            <div className="text-[11px] font-display font-700 text-white">Verified banks</div>
          </div>
          <div>
            <div className="mx-auto w-9 h-9 rounded-lg grid place-items-center"
                 style={{ background: "#7C3AED18", color: "#A855F7", border: "1px solid #A855F740" }}>
              <Flame className="w-4 h-4" />
            </div>
            <div className="mt-1.5 text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">24/7</div>
            <div className="text-[11px] font-display font-700 text-white">Live gateways</div>
          </div>
        </div>
      </SoftCard>

      {/* Welcome pop-up — redesigned with the same aesthetic */}
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent
          data-testid="welcome-dialog"
          className="bg-transparent border-0 text-white max-w-md w-[calc(100vw-2rem)] rounded-2xl overflow-hidden p-0"
        >
          <div className="relative rounded-2xl overflow-hidden"
               style={{ boxShadow: "0 24px 80px -20px rgba(245,197,24,0.55), 0 0 0 1px rgba(245,197,24,0.25)" }}>
            {/* Dashed gold accent */}
            <div className="absolute inset-x-0 top-0 h-[3px] z-10 pointer-events-none"
                 style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.7 }} />
            <div className="absolute inset-x-0 bottom-0 h-[3px] z-10 pointer-events-none"
                 style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.7 }} />

            <div className="relative p-6 bg-[var(--nb-card)]">
              {/* Ambient orbs */}
              <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none"
                   style={{ background: "radial-gradient(circle,#F5C51844,transparent 70%)" }} />
              <div className="absolute -bottom-12 -left-12 w-32 h-32 rounded-full pointer-events-none"
                   style={{ background: "radial-gradient(circle,#7C3AED33,transparent 70%)" }} />

              <div className="relative text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl grid place-items-center mb-3"
                     style={{ background: "linear-gradient(135deg,#FFE580,#F5C518)",
                              boxShadow: "0 8px 30px rgba(245,197,24,0.55)" }}>
                  <PartyPopper className="w-8 h-8 text-[#1A1508]" />
                </div>
                <h2 className="font-display font-800 text-xl text-white">
                  Welcome back, {firstName}!
                </h2>
                <p className="mt-2 text-sm text-[var(--nb-muted)] leading-relaxed">
                  {welcomeMsg}
                </p>

                <div className="mt-4 flex justify-center">
                  <StackChip label="Balance" value={formatNaira(user?.wallet_balance || 0)} tone="gold" testid="welcome-balance-chip" />
                </div>
              </div>

              <DialogFooter className="relative mt-6 flex flex-col-reverse sm:flex-col gap-2">
                {tg && (
                  <a href={tg} target="_blank" rel="noreferrer" data-testid="welcome-telegram-btn" className="block">
                    <Button className="w-full h-11 bg-[#229ED9] hover:bg-[#1a8fc5] rounded-xl">
                      <Send className="w-4 h-4 mr-2" /> Join our Telegram community
                    </Button>
                  </a>
                )}
                <button
                  onClick={() => setWelcomeOpen(false)}
                  data-testid="welcome-close-btn"
                  className="w-full h-12 rounded-full font-display font-700 text-sm text-[#1A1508] transition-all hover:brightness-110 flex items-center justify-center gap-1"
                  style={{
                    background: "linear-gradient(135deg,#FFE580,#F5C518)",
                    boxShadow: "0 8px 24px -6px rgba(245,197,24,0.55)",
                  }}
                >
                  Continue to dashboard <ChevronRight className="w-4 h-4" />
                </button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
