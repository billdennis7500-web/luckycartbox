/**
 * Profile — restructured after user feedback (2026-07-29).
 *
 * Layout inspired by the reference screenshots the user shared, but rebuilt
 * in Luckycart Box's dark-navy + gold aesthetic:
 *
 *   1. User identity card — avatar + name + masked phone + tier badge
 *   2. Two side-by-side hero cards — Wallet balance (Deposit CTA) + Bonus
 *      balance (Redeem CTA)
 *   3. Three-tile stat row — Purchases, Total spent, Total earned
 *   4. Quick-action strip (4 icons) — Deposit, Withdraw, Transactions, Bank
 *   5. Grouped menu sections (matching the reference's card grouping):
 *       • Group A: Team, Invite Friends, My Level
 *       • Group B: Messages (badge), My Coupons, Gift Code
 *       • Group C: Change Password, Customer Service, About
 *   6. Sign out row
 *
 * All existing profile links continue to work and keep their existing
 * `data-testid`s for testing continuity.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatNaira } from "@/lib/api";
import {
  ArrowDownToLine, ArrowUpFromLine, Users as UsersIcon, LogOut,
  Shield, Copy, ChevronRight, Ticket, Landmark, Inbox, ScrollText, History,
  Sparkles, MessageSquare, Lock, LifeBuoy, Info, Trophy,
  ShoppingBag, TrendingUp, Wallet, Coins, Send,
} from "lucide-react";
import { toast } from "sonner";
import { SoftCard, MicroLabel } from "@/components/design";
import { deriveLevel } from "@/lib/levels";
import { ProfilePendant, TierMedallion } from "@/components/ProfilePendant";

const TILE_TONES = {
  info:    "#0055FF",
  success: "#10B981",
  gold:    "#F5C518",
  purple:  "#A855F7",
  hot:     "#EF4444",
  cyan:    "#06B6D4",
  orange:  "#F97316",
};

function maskPhone(p = "") {
  if (!p) return "";
  const digits = p.replace(/\D/g, "");
  if (digits.length < 7) return p;
  return `${digits.slice(0, 4)}****${digits.slice(-3)}`;
}

/* ---------------------------- MENU LINK ROW ------------------------------- */
function MenuRow({ to, icon: Icon, label, hint, tone = "info", testid, badge, onClick }) {
  const c = TILE_TONES[tone] || TILE_TONES.info;
  const body = (
    <>
      <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0"
           style={{ background: `${c}18`, border: `1px solid ${c}40`, color: c }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-700 text-sm text-white truncate flex items-center gap-2">
          {label}
          {badge && (
            <span className="text-[9px] font-display font-800 px-1.5 py-0.5 rounded-full"
                  style={{ background: "#EF4444", color: "#FFFFFF" }}>
              {badge}
            </span>
          )}
        </div>
        {hint && <div className="text-[11px] text-[var(--nb-muted)] truncate">{hint}</div>}
      </div>
      <ChevronRight className="w-4 h-4 text-[var(--nb-muted)]" />
    </>
  );
  const cls = "flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--nb-card2)] transition-colors w-full text-left";
  if (onClick) {
    return (
      <button onClick={onClick} data-testid={testid} className={cls}>{body}</button>
    );
  }
  return (
    <Link to={to} data-testid={testid} className={cls}>{body}</Link>
  );
}

/* ---------------------------- QUICK ACTION ICON --------------------------- */
function QuickAction({ to, icon: Icon, label, tone = "gold", testid }) {
  const c = TILE_TONES[tone] || TILE_TONES.gold;
  return (
    <Link
      to={to}
      data-testid={testid}
      className="flex flex-col items-center gap-1.5 rounded-xl py-3 transition-transform active:scale-[0.96] hover:bg-[var(--nb-card2)]"
    >
      <div
        className="w-11 h-11 rounded-full grid place-items-center"
        style={{
          background: `${c}18`,
          border: `1px solid ${c}40`,
          color: c,
          boxShadow: `0 4px 12px ${c}22`,
        }}
      >
        <Icon className="w-4 h-4" strokeWidth={2.4} />
      </div>
      <div className="text-[10px] font-display font-700 text-white text-center leading-tight">
        {label}
      </div>
    </Link>
  );
}

/* ---------------------------- STAT MINI TILE ------------------------------ */
function StatTile({ icon: Icon, value, label, tone = "gold", testid }) {
  const c = TILE_TONES[tone] || TILE_TONES.gold;
  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-3 flex flex-col items-center text-center"
      style={{ boxShadow: `0 4px 14px -6px ${c}55, 0 0 0 1px ${c}20` }}
      data-testid={testid}
    >
      <div
        className="w-9 h-9 rounded-full grid place-items-center mb-1.5"
        style={{ background: `${c}18`, border: `1px solid ${c}40`, color: c }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="font-display font-800 tabular text-white text-base leading-none">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)] mt-1 font-display font-700">
        {label}
      </div>
    </div>
  );
}

/* ---------------------------- HERO STAT CARD ------------------------------ */
function HeroCard({ label, value, ctaLabel, ctaTo, tone = "gold", icon: Icon, testid }) {
  const c = TILE_TONES[tone] || TILE_TONES.gold;
  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-4 flex flex-col justify-between min-h-[124px]"
      style={{ boxShadow: `0 8px 28px -10px ${c}66, 0 0 0 1px ${c}30` }}
      data-testid={testid}
    >
      {/* Dashed accent line top */}
      <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
           style={{ background: `repeating-linear-gradient(90deg,${c} 0 8px,transparent 8px 14px)`, opacity: 0.65 }} />
      {/* Radial glow */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-25 blur-2xl pointer-events-none"
           style={{ background: c }} />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-display font-700"
             style={{ color: c }}>
          <Icon className="w-3 h-3" />
          {label}
        </div>
        <div className="mt-1.5 font-display font-800 tabular text-xl text-white truncate">
          {value}
        </div>
      </div>
      <div className="relative mt-2">
        <Link
          to={ctaTo}
          data-testid={`${testid}-cta`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-display font-800 transition-all hover:brightness-110 active:scale-[0.97]"
          style={{
            background: `linear-gradient(135deg,${c},${c}CC)`,
            color: c === "#F5C518" ? "#1A1508" : "#FFFFFF",
            boxShadow: `0 4px 12px ${c}55`,
          }}
        >
          {ctaLabel} <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

/* =========================== PAGE COMPONENT =============================== */
export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [invCount, setInvCount] = useState(null);
  const [refLevel, setRefLevel] = useState(null);

  useEffect(() => {
    api.get("/investments").then((r) => setInvCount((r.data || []).length))
       .catch(() => setInvCount(0));
    // Referral pendant — fetch current unlocked tier for the avatar medallion
    api.get("/referrals/rewards").then((r) => {
      const d = r.data || {};
      const unlocked = (d.tiers || []).filter((t) => t.unlocked);
      // Highest unlocked tier is the "achieved" level shown as pendant
      const top = unlocked.length ? unlocked[unlocked.length - 1] : null;
      setRefLevel(top);
    }).catch(() => setRefLevel(null));
  }, []);

  const level = useMemo(() => deriveLevel(user?.total_invested || 0), [user?.total_invested]);
  const tierColor = level.current.color;
  const tierLabel = level.current.name;

  const onLogout = async () => {
    await logout();
    nav("/");
  };

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(user?.referral_code || "");
      toast.success("Referral code copied");
    } catch { toast.error("Clipboard blocked — copy manually"); }
  };

  return (
    <div className="space-y-5">
      {/* -------- 1. User identity card -------- */}
      <div
        className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-4"
        style={{ boxShadow: "0 8px 32px -10px rgba(245,197,24,0.45), 0 0 0 1px rgba(245,197,24,0.30)" }}
        data-testid="profile-identity-card"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
             style={{ background: "repeating-linear-gradient(90deg,#F5C518 0 10px,transparent 10px 18px)", opacity: 0.7 }} />
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl pointer-events-none"
             style={{ background: "#F5C518" }} />

        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <div
              className="w-16 h-16 rounded-2xl grid place-items-center text-xl font-display font-800"
              style={{
                background: "linear-gradient(135deg,#FFE580,#F5C518)",
                color: "#1A1508",
                boxShadow: "0 6px 22px -6px rgba(245,197,24,0.55)",
              }}
            >
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            {/* Referral level pendant — pinned to avatar's bottom-right */}
            {refLevel && (
              <button
                onClick={() => nav("/rewards")}
                data-testid="profile-avatar-pendant"
                aria-label={`View ${refLevel.name} reward level`}
                className="absolute -bottom-1.5 -right-1.5 transition-transform active:scale-90 focus:outline-none"
              >
                <TierMedallion tier={refLevel} size={30} />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-display font-800 text-lg text-white truncate" data-testid="profile-name">
                {user?.name || "—"}
              </div>
              {/* Tier badge (investment tier) */}
              <span
                data-testid="profile-tier-badge"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-display font-800 uppercase tracking-widest text-[9px] shrink-0"
                style={{
                  background: `${tierColor}18`,
                  color: tierColor,
                  border: `1px solid ${tierColor}55`,
                }}
              >
                <Sparkles className="w-2.5 h-2.5" />
                {tierLabel}
              </span>
              {/* Referral pendant label — shown when user has unlocked ≥ 1 level */}
              {refLevel && (
                <span
                  data-testid="profile-ref-level-pill"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-display font-800 uppercase tracking-widest text-[9px] shrink-0"
                  style={{
                    background: `${refLevel.color}1F`,
                    color: refLevel.color,
                    border: `1px solid ${refLevel.color}55`,
                  }}
                >
                  {refLevel.name} member
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--nb-muted)] tabular truncate mt-0.5" data-testid="profile-phone">
              {maskPhone(user?.phone)}
            </div>
            {/* Referral code inline */}
            <div className="mt-2 flex items-center gap-1.5">
              <MicroLabel tone="epic" className="!mt-0">Ref code</MicroLabel>
              <button
                onClick={copyRef}
                data-testid="profile-copy-ref"
                className="inline-flex items-center gap-1 text-[11px] font-display font-700 tabular text-[#A855F7] hover:text-[#C084FC]"
              >
                {user?.referral_code || "—"} <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* -------- 2. Two hero cards side by side (Balance + Bonus) -------- */}
      <div className="grid grid-cols-2 gap-3">
        <HeroCard
          label="Balance"
          icon={Wallet}
          value={formatNaira(user?.wallet_balance)}
          ctaLabel="Deposit"
          ctaTo="/deposit"
          tone="gold"
          testid="hero-wallet"
        />
        <HeroCard
          label="Bonus"
          icon={Coins}
          value={formatNaira(user?.bonus_balance)}
          ctaLabel="Redeem"
          ctaTo="/coupon"
          tone="purple"
          testid="hero-bonus"
        />
      </div>

      {/* -------- 3. Three-tile stat row -------- */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          icon={ShoppingBag}
          value={invCount === null ? "…" : invCount}
          label="Purchases"
          tone="cyan"
          testid="stat-purchases"
        />
        <StatTile
          icon={TrendingUp}
          value={formatNaira(user?.total_invested || 0)}
          label="Spent"
          tone="orange"
          testid="stat-spent"
        />
        <StatTile
          icon={Trophy}
          value={formatNaira(user?.total_earned || 0)}
          label="Earned"
          tone="success"
          testid="stat-earned"
        />
      </div>

      {/* -------- 4. Quick action strip -------- */}
      <SoftCard padded={false} testid="quick-actions-card">
        <div className="grid grid-cols-4 p-2">
          <QuickAction to="/deposit"          icon={ArrowDownToLine} label="Deposit"      tone="success" testid="qa-deposit" />
          <QuickAction to="/withdraw"         icon={ArrowUpFromLine} label="Withdraw"     tone="info"    testid="qa-withdraw" />
          <QuickAction to="/transactions"     icon={History}         label="Transactions" tone="cyan"    testid="qa-transactions" />
          <QuickAction to="/bank-account"     icon={Landmark}        label="Bank Card"    tone="gold"    testid="qa-bank" />
        </div>
      </SoftCard>

      {/* -------- 5a. Group A: Team / Invite / Level -------- */}
      <SoftCard padded={false} testid="menu-group-team">
        <div className="divide-y divide-[var(--nb-border)]">
          <MenuRow to="/referrals" icon={UsersIcon} label="My Team"       hint="View your referral network" tone="purple" testid="menu-team" />
          <MenuRow to="/referrals" icon={Send}      label="Invite Friends" hint="Earn 3-generation commissions" tone="info" testid="menu-invite" />
          <MenuRow
            to="/level"
            icon={Trophy}
            label="My Level"
            hint={level.next
              ? `${tierLabel} · ${formatNaira(Math.max(0, level.next.threshold - (user?.total_invested || 0)))} to ${level.next.name}`
              : `${tierLabel} · Max level reached`}
            tone="gold"
            testid="menu-level"
          />
        </div>
      </SoftCard>

      {/* -------- 5b. Group B: History / Coupons -------- */}
      <SoftCard padded={false} testid="menu-group-money">
        <div className="divide-y divide-[var(--nb-border)]">
          <MenuRow to="/deposit-history"  icon={Inbox}      label="Deposit history"    hint="Every top-up you've made"    tone="success" testid="profile-link-deposit-history" />
          <MenuRow to="/withdraw-history" icon={ScrollText} label="Withdrawal history" hint="Every payout you've requested" tone="gold"    testid="profile-link-withdraw-history" />
          <MenuRow to="/coupon"           icon={Ticket}     label="My Coupons"         hint="Enter a coupon or gift code" tone="purple"  testid="menu-coupons" />
        </div>
      </SoftCard>

      {/* -------- 5c. Group C: Password / Support / About -------- */}
      <SoftCard padded={false} testid="menu-group-account">
        <div className="divide-y divide-[var(--nb-border)]">
          <MenuRow to="/change-password"  icon={Lock}     label="Change Password"  hint="Keep your account safe"    tone="info"    testid="menu-password" />
          <MenuRow to="/customer-service" icon={LifeBuoy} label="Customer Service" hint="WhatsApp, Telegram & FAQ"  tone="success" testid="menu-customer-service" />
          <MenuRow to="/about"            icon={Info}     label="About us"         hint="Mission, values & version" tone="cyan"    testid="menu-about" />
          {user?.role === "admin" && (
            <MenuRow to="/admin" icon={Shield} label="Admin panel" hint="Control center" tone="hot" testid="profile-link-admin" />
          )}
        </div>
      </SoftCard>

      {/* -------- 6. Sign out -------- */}
      <button
        onClick={onLogout}
        data-testid="profile-logout-button"
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl transition-colors bg-[var(--nb-card)] text-[#EF4444] hover:bg-[#EF4444]/8 font-display font-700"
        style={{ boxShadow: "0 4px 14px -6px rgba(239,68,68,0.35), 0 0 0 1px rgba(239,68,68,0.25)" }}
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  );
}
