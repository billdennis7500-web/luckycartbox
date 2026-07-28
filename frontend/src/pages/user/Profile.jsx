import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  ArrowDownToLine, ArrowUpFromLine, Users as UsersIcon, LogOut,
  Shield, Copy, ChevronRight, Ticket, Landmark, Inbox, ScrollText, History,
} from "lucide-react";
import { toast } from "sonner";
import { AmbientCard, SoftCard, MicroLabel } from "@/components/design";

const TILE_TONES = {
  info:    "#0055FF",
  success: "#10B981",
  gold:    "#F5C518",
  purple:  "#A855F7",
  hot:     "#EF4444",
  cyan:    "#06B6D4",
};

function ProfileLink({ to, icon: Icon, label, hint, tone = "info", testid }) {
  const c = TILE_TONES[tone] || TILE_TONES.info;
  return (
    <Link
      to={to}
      data-testid={testid}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--nb-card2)] transition-colors"
    >
      <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0"
           style={{ background: `${c}18`, border: `1px solid ${c}40`, color: c }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-700 text-sm text-white truncate">{label}</div>
        <div className="text-[11px] text-[var(--nb-muted)] truncate">{hint}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-[var(--nb-muted)]" />
    </Link>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const onLogout = async () => {
    await logout();
    nav("/");
  };

  const copy = async (v) => {
    try { await navigator.clipboard.writeText(v); toast.success("Copied"); }
    catch { toast.error("Clipboard blocked — copy manually"); }
  };

  return (
    <div className="space-y-6">
      {/* Header — gold ambient card */}
      <AmbientCard tone="gold" testid="profile-header-card">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl grid place-items-center text-xl font-display font-800 shrink-0"
            style={{
              background: "linear-gradient(135deg,#FFE580,#F5C518)",
              color: "#1A1508",
              boxShadow: "0 6px 22px -6px rgba(245,197,24,0.55)",
            }}
          >
            {(user?.name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <MicroLabel tone="gold">Account</MicroLabel>
            <div className="font-display font-800 text-xl text-white truncate" data-testid="profile-name">
              {user?.name}
            </div>
            <div className="text-xs text-[var(--nb-muted)] tabular truncate mt-0.5" data-testid="profile-phone">
              {user?.phone}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl p-3.5"
             style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.30)" }}>
          <div className="min-w-0">
            <MicroLabel tone="epic">Referral code</MicroLabel>
            <div className="mt-1 font-display font-800 text-lg tabular text-white truncate" data-testid="profile-referral-code">
              {user?.referral_code}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy(user?.referral_code || "")}
            data-testid="profile-copy-ref"
            className="border-[#A855F7]/40 bg-[#A855F7]/10 text-[#A855F7] hover:bg-[#A855F7]/20 shrink-0"
          >
            <Copy className="w-3 h-3 mr-1" /> Copy
          </Button>
        </div>
      </AmbientCard>

      {/* Menu links */}
      <SoftCard padded={false} testid="profile-menu-card">
        <div className="divide-y divide-[var(--nb-border)] overflow-hidden">
          <ProfileLink to="/referrals" icon={UsersIcon} label="Referrals" hint="Invite & earn 3-gen commissions" tone="purple" testid="profile-link-referrals" />
          <ProfileLink to="/transactions" icon={History} label="Transaction history" hint="Every wallet movement" tone="cyan" testid="profile-link-transactions" />
          <ProfileLink to="/deposit" icon={ArrowDownToLine} label="Deposit" hint="Fund your wallet" tone="success" testid="profile-link-deposit" />
          <ProfileLink to="/deposit-history" icon={Inbox} label="Deposit history" hint="Every top-up you've made" tone="success" testid="profile-link-deposit-history" />
          <ProfileLink to="/withdraw" icon={ArrowUpFromLine} label="Withdraw" hint="Cash out to bank" tone="info" testid="profile-link-withdraw" />
          <ProfileLink to="/withdraw-history" icon={ScrollText} label="Withdrawal history" hint="Every payout you've requested" tone="gold" testid="profile-link-withdraw-history" />
          <ProfileLink to="/bank-account" icon={Landmark} label="Bank account" hint="Bind or update your payout account" tone="info" testid="profile-link-bank" />
          <ProfileLink to="/coupon" icon={Ticket} label="Redeem coupon" hint="Use a promo code" tone="gold" testid="profile-link-coupon" />
          {user?.role === "admin" && (
            <ProfileLink to="/admin" icon={Shield} label="Admin panel" hint="Control center" tone="hot" testid="profile-link-admin" />
          )}
          <button
            onClick={onLogout}
            data-testid="profile-logout-button"
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#EF4444]/8 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0"
                 style={{ background: "#EF444418", border: "1px solid #EF444440", color: "#EF4444" }}>
              <LogOut className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-display font-700 text-sm text-white">Sign out</div>
              <div className="text-[11px] text-[var(--nb-muted)]">End this session</div>
            </div>
          </button>
        </div>
      </SoftCard>
    </div>
  );
}
