import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowDownToLine, ArrowUpFromLine, Ticket, Sparkles, Gift, TrendingUp, Wallet,
  Eye, EyeOff, Copy, Send, PartyPopper,
} from "lucide-react";
import { toast } from "sonner";

function QuickAction({ to, icon: Icon, label, tone, testid }) {
  const map = {
    green:  { bg: "bg-[#10B981]/15", ring: "border-[#10B981]/30", fg: "text-[#10B981]" },
    blue:   { bg: "bg-[#0055FF]/15", ring: "border-[#0055FF]/30", fg: "text-[#0055FF]" },
    amber:  { bg: "bg-[#F59E0B]/15", ring: "border-[#F59E0B]/30", fg: "text-[#F59E0B]" },
    violet: { bg: "bg-[#8B5CF6]/15", ring: "border-[#8B5CF6]/30", fg: "text-[#8B5CF6]" },
  };
  const t = map[tone] || map.blue;
  return (
    <Link to={to} data-testid={testid} className="block">
      <div className="rounded-2xl border border-[#1A2B44] bg-[#0B1524] p-4 card-hover flex flex-col items-center justify-center gap-2 min-h-[110px]">
        <div className={`w-12 h-12 rounded-xl ${t.bg} border ${t.ring} grid place-items-center`}>
          <Icon className={`w-5 h-5 ${t.fg}`} />
        </div>
        <div className="text-xs font-display font-600 text-center">{label}</div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [settings, setSettings] = useState({ telegram_url: "", welcome_message: "", site_name: "NaijaInvest" });
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    refresh();
    api.get("/settings/public")
      .then((r) => {
        setSettings(r.data || {});
        // Show welcome pop-up on every home visit / refresh (per user's request)
        setWelcomeOpen(true);
      })
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
  const brand = settings.site_name || "NaijaInvest";
  const welcomeMsg = (settings.welcome_message || "").trim() ||
    `Welcome to ${brand} — grow your money the smart way. Invest today, cash out tomorrow.`;

  return (
    <div className="space-y-6">
      {/* Greeting + Telegram chip */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Welcome</div>
          <h1 className="font-display text-2xl font-800 tracking-tight mt-1" data-testid="dashboard-heading">
            Hi, {user?.name?.split(" ")[0] || "there"} 👋
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
            <Send className="w-3.5 h-3.5" /> Join Telegram
          </a>
        )}
      </div>

      {/* Wallet balance card */}
      <Card
        data-testid="wallet-card"
        className="rounded-2xl border border-[#1A2B44] bg-gradient-to-br from-[#0055FF] via-[#003ec7] to-[#0B1524] p-6 text-white shadow-[0_20px_60px_-25px_rgba(0,85,255,0.6)]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/70">
            <Wallet className="w-3.5 h-3.5" /> Wallet balance
          </div>
          <button
            onClick={() => setHidden((v) => !v)}
            data-testid="wallet-hide-toggle"
            className="text-white/70 hover:text-white transition-colors"
          >
            {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="mt-3 font-display font-800 text-4xl sm:text-5xl tabular" data-testid="wallet-amount">
          {hidden ? "₦ • • • • •" : formatNaira(user?.wallet_balance)}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-white/60 uppercase tracking-wider">Bonus</div>
            <div className="mt-1 font-display font-600 tabular">{formatNaira(user?.bonus_balance)}</div>
          </div>
          <div>
            <div className="text-white/60 uppercase tracking-wider">Invested</div>
            <div className="mt-1 font-display font-600 tabular">{formatNaira(user?.total_invested)}</div>
          </div>
          <div>
            <div className="text-white/60 uppercase tracking-wider">Earned</div>
            <div className="mt-1 font-display font-600 tabular">{formatNaira(user?.total_earned)}</div>
          </div>
        </div>
      </Card>

      {/* Quick actions — Deposit / Redeem / Withdraw / Invest in a 4-in-1 grid */}
      <section>
        <h2 className="font-display text-xs font-600 uppercase tracking-widest text-[#94A3B8] mb-3">
          Quick actions
        </h2>
        <div className="grid grid-cols-4 gap-3" data-testid="quick-actions-grid">
          <QuickAction to="/deposit"     icon={ArrowDownToLine} label="Deposit"  tone="green"  testid="quick-deposit-link" />
          <QuickAction to="/withdraw"    icon={ArrowUpFromLine} label="Withdraw" tone="blue"   testid="quick-withdraw-link" />
          <QuickAction to="/coupon"      icon={Ticket}          label="Redeem"   tone="amber"  testid="quick-redeem-link" />
          <QuickAction to="/marketplace" icon={TrendingUp}      label="Invest"   tone="violet" testid="quick-invest-link" />
        </div>
      </section>

      {/* Not-invested nudge */}
      {!user?.has_invested && (
        <div
          data-testid="not-invested-banner"
          className="rounded-xl border border-[#0055FF]/40 bg-[#0055FF]/10 p-4 flex items-start gap-3"
        >
          <Sparkles className="w-5 h-5 text-[#0055FF] mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-display font-600 text-sm">
              You have {formatNaira(user?.bonus_balance)} welcome bonus.
            </div>
            <div className="text-xs text-[#94A3B8] mt-1">
              Invest to unlock withdrawals, referral commissions and coupon redemptions.
            </div>
          </div>
        </div>
      )}

      {/* Referral code hint */}
      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Your referral code</div>
            <div className="mt-1 font-display font-800 text-xl tabular" data-testid="dashboard-ref-code">
              {user?.referral_code}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={copyCode}
              data-testid="dashboard-copy-ref"
              className="border-[#1A2B44] bg-transparent text-white"
            >
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
            <Link to="/referrals" data-testid="dashboard-referrals-link">
              <Button size="sm" className="bg-[#0055FF] hover:bg-[#3377FF]">
                <Gift className="w-3 h-3 mr-1" /> Invite
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Welcome modal (opens on every home visit / refresh) */}
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent
          data-testid="welcome-dialog"
          className="bg-[#0B1524] border-[#1A2B44] text-white max-w-md w-[calc(100%-2rem)] mx-4 rounded-2xl overflow-hidden"
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[#0055FF]/30 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-[#8B5CF6]/20 blur-3xl" />
          </div>
          <div className="relative">
            <DialogHeader className="text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center mb-2">
                <PartyPopper className="w-6 h-6 text-[#0055FF]" />
              </div>
              <DialogTitle className="font-display text-xl">
                Welcome back, {user?.name?.split(" ")[0] || "friend"}!
              </DialogTitle>
              <DialogDescription className="text-[#94A3B8] text-sm leading-relaxed pt-1">
                {welcomeMsg}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="mt-5 flex flex-col-reverse sm:flex-col gap-2">
              {tg && (
                <a href={tg} target="_blank" rel="noreferrer" data-testid="welcome-telegram-btn" className="block">
                  <Button className="w-full h-11 bg-[#229ED9] hover:bg-[#1a8fc5]">
                    <Send className="w-4 h-4 mr-2" /> Join our Telegram community
                  </Button>
                </a>
              )}
              <Button
                onClick={() => setWelcomeOpen(false)}
                variant={tg ? "outline" : "default"}
                data-testid="welcome-close-btn"
                className={tg
                  ? "w-full h-11 border-[#1A2B44] bg-transparent text-white"
                  : "w-full h-11 bg-[#0055FF] hover:bg-[#3377FF]"}
              >
                Continue to dashboard
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
