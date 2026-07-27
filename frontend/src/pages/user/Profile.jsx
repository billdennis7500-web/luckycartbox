import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowDownToLine, ArrowUpFromLine, Users as UsersIcon, LogOut,
  Shield, Copy, ChevronRight, Ticket, Landmark, Receipt, History,
} from "lucide-react";
import { toast } from "sonner";

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
      {/* Header card */}
      <Card
        data-testid="profile-header-card"
        className="rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-card)] p-6"
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#0055FF]/20 border border-[#0055FF]/40 grid place-items-center text-xl font-display font-800">
            {(user?.name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display font-800 text-xl truncate" data-testid="profile-name">{user?.name}</div>
            <div className="text-sm text-[var(--nb-muted)] tabular" data-testid="profile-phone">{user?.phone}</div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-lg border border-[#0055FF]/40 bg-[#0055FF]/10 p-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--nb-muted)]">Referral code</div>
            <div className="mt-1 font-display font-800 text-lg tabular" data-testid="profile-referral-code">
              {user?.referral_code}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy(user?.referral_code || "")}
            data-testid="profile-copy-ref"
            className="border-[var(--nb-border)] bg-transparent text-white"
          >
            <Copy className="w-3 h-3 mr-1" /> Copy
          </Button>
        </div>
      </Card>

      {/* Menu links */}
      <Card className="rounded-xl border border-[var(--nb-border)] bg-[var(--nb-card)] divide-y divide-[var(--nb-border)] overflow-hidden">
        <ProfileLink to="/referrals" icon={UsersIcon} label="Referrals" hint="Invite & earn 3-gen commissions" testid="profile-link-referrals" />
        <ProfileLink to="/transactions" icon={History} label="Transaction history" hint="Every wallet movement" testid="profile-link-transactions" />
        <ProfileLink to="/deposit" icon={ArrowDownToLine} label="Deposit" hint="Fund your wallet" testid="profile-link-deposit" />
        <ProfileLink to="/deposit-history" icon={Receipt} label="Deposit history" hint="Every top-up you've made" testid="profile-link-deposit-history" />
        <ProfileLink to="/withdraw" icon={ArrowUpFromLine} label="Withdraw" hint="Cash out to bank" testid="profile-link-withdraw" />
        <ProfileLink to="/withdraw-history" icon={Receipt} label="Withdrawal history" hint="Every payout you've requested" testid="profile-link-withdraw-history" />
        <ProfileLink to="/bank-account" icon={Landmark} label="Bank account" hint="Bind or update your payout account" testid="profile-link-bank" />
        <ProfileLink to="/coupon" icon={Ticket} label="Redeem coupon" hint="Use a promo code" testid="profile-link-coupon" />
        {user?.role === "admin" && (
          <ProfileLink to="/admin" icon={Shield} label="Admin panel" hint="Control center" testid="profile-link-admin" />
        )}
        <button
          onClick={onLogout}
          data-testid="profile-logout-button"
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[var(--nb-card2)] transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/30 grid place-items-center">
            <LogOut className="w-4 h-4 text-[#EF4444]" />
          </div>
          <div className="flex-1">
            <div className="font-display font-600 text-sm">Sign out</div>
            <div className="text-xs text-[var(--nb-muted)]">End this session</div>
          </div>
        </button>
      </Card>
    </div>
  );
}

function ProfileLink({ to, icon: Icon, label, hint, testid }) {
  return (
    <Link
      to={to}
      data-testid={testid}
      className="flex items-center gap-3 px-5 py-4 hover:bg-[var(--nb-card2)] transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
        <Icon className="w-4 h-4 text-[#0055FF]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-600 text-sm truncate">{label}</div>
        <div className="text-xs text-[var(--nb-muted)] truncate">{hint}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-[var(--nb-muted)]" />
    </Link>
  );
}
