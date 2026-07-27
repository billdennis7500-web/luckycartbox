import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowDownToLine, ArrowUpFromLine, Receipt, Users as UsersIcon, LogOut,
  Shield, Copy, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/pages/user/Deposit";
import LoadMore from "@/components/LoadMore";

export default function Profile() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [tx, setTx] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [tab, setTab] = useState("transactions");
  const [visTx, setVisTx] = useState(10);
  const [visDep, setVisDep] = useState(10);
  const [visWd, setVisWd] = useState(10);

  useEffect(() => {
    api.get("/transactions").then((r) => setTx(r.data));
    api.get("/deposits").then((r) => setDeposits(r.data));
    api.get("/withdrawals").then((r) => setWithdrawals(r.data));
  }, []);

  const onLogout = async () => {
    await logout();
    nav("/");
  };

  const copy = (v) => {
    navigator.clipboard.writeText(v);
    toast.success("Copied");
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card
        data-testid="profile-header-card"
        className="rounded-2xl border border-[#1A2B44] bg-[#0B1524] p-6"
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#0055FF]/20 border border-[#0055FF]/40 grid place-items-center text-xl font-display font-800">
            {(user?.name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display font-800 text-xl truncate" data-testid="profile-name">{user?.name}</div>
            <div className="text-sm text-[#94A3B8] tabular" data-testid="profile-phone">{user?.phone}</div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-lg border border-[#0055FF]/40 bg-[#0055FF]/10 p-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Referral code</div>
            <div className="mt-1 font-display font-800 text-lg tabular" data-testid="profile-referral-code">
              {user?.referral_code}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy(user?.referral_code || "")}
            data-testid="profile-copy-ref"
            className="border-[#1A2B44] bg-transparent text-white"
          >
            <Copy className="w-3 h-3 mr-1" /> Copy
          </Button>
        </div>
      </Card>

      {/* Menu links */}
      <Card className="rounded-xl border border-[#1A2B44] bg-[#0B1524] divide-y divide-[#1A2B44] overflow-hidden">
        <ProfileLink to="/referrals" icon={UsersIcon} label="Referrals" hint="Invite & earn 3-gen commissions" testid="profile-link-referrals" />
        <ProfileLink to="/deposit" icon={ArrowDownToLine} label="Deposit" hint="Fund your wallet" testid="profile-link-deposit" />
        <ProfileLink to="/withdraw" icon={ArrowUpFromLine} label="Withdraw" hint="Cash out to bank" testid="profile-link-withdraw" />
        {user?.role === "admin" && (
          <ProfileLink to="/admin" icon={Shield} label="Admin panel" hint="Control center" testid="profile-link-admin" />
        )}
        <button
          onClick={onLogout}
          data-testid="profile-logout-button"
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[#121E30] transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/30 grid place-items-center">
            <LogOut className="w-4 h-4 text-[#EF4444]" />
          </div>
          <div className="flex-1">
            <div className="font-display font-600 text-sm">Sign out</div>
            <div className="text-xs text-[#94A3B8]">End this session</div>
          </div>
        </button>
      </Card>

      {/* History tabs */}
      <div>
        <h2 className="font-display text-lg font-600 mb-3">History</h2>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList
            data-testid="profile-tabs"
            className="w-full grid grid-cols-3 bg-[#0B1524] border border-[#1A2B44] rounded-lg p-1 h-auto"
          >
            <TabsTrigger
              value="transactions"
              data-testid="profile-tab-transactions"
              className="data-[state=active]:bg-[#0055FF] data-[state=active]:text-white text-[#94A3B8] rounded-md text-xs sm:text-sm"
            >
              Transactions
            </TabsTrigger>
            <TabsTrigger
              value="deposits"
              data-testid="profile-tab-deposits"
              className="data-[state=active]:bg-[#0055FF] data-[state=active]:text-white text-[#94A3B8] rounded-md text-xs sm:text-sm"
            >
              Deposits
            </TabsTrigger>
            <TabsTrigger
              value="withdrawals"
              data-testid="profile-tab-withdrawals"
              className="data-[state=active]:bg-[#0055FF] data-[state=active]:text-white text-[#94A3B8] rounded-md text-xs sm:text-sm"
            >
              Withdrawals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-4">
            <Card className="rounded-xl border border-[#1A2B44] bg-[#0B1524] divide-y divide-[#1A2B44] overflow-hidden">
              {tx.length === 0 ? (
                <EmptyRow label="No transactions yet" testid="no-tx" />
              ) : tx.slice(0, visTx).map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm" data-testid={`profile-tx-${t.id}`}>
                  <div className="min-w-0">
                    <div className="capitalize truncate">{t.type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-[#94A3B8] truncate">{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                  <div className={`tabular font-display font-600 shrink-0 ${t.amount >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                    {t.amount >= 0 ? "+" : ""}{formatNaira(t.amount)}
                  </div>
                </div>
              ))}
            </Card>
            <LoadMore shown={Math.min(visTx, tx.length)} total={tx.length} onMore={setVisTx} testid="load-more-tx" />
          </TabsContent>

          <TabsContent value="deposits" className="mt-4">
            <Card className="rounded-xl border border-[#1A2B44] bg-[#0B1524] divide-y divide-[#1A2B44] overflow-hidden">
              {deposits.length === 0 ? (
                <EmptyRow label="No deposits yet" testid="no-deps" />
              ) : deposits.slice(0, visDep).map((d) => (
                <div key={d.id} className="flex items-center justify-between px-4 py-3 text-sm" data-testid={`profile-dep-${d.id}`}>
                  <div className="min-w-0">
                    <div className="tabular font-display font-600">{formatNaira(d.amount)}</div>
                    <div className="text-xs text-[#94A3B8]">
                      {new Date(d.created_at).toLocaleString()} · {d.gateway === "paynow" ? "Instant Pay" : "Manual"}
                    </div>
                  </div>
                  <StatusPill status={d.status} />
                </div>
              ))}
            </Card>
            <LoadMore shown={Math.min(visDep, deposits.length)} total={deposits.length} onMore={setVisDep} testid="load-more-deps" />
          </TabsContent>

          <TabsContent value="withdrawals" className="mt-4">
            <Card className="rounded-xl border border-[#1A2B44] bg-[#0B1524] divide-y divide-[#1A2B44] overflow-hidden">
              {withdrawals.length === 0 ? (
                <EmptyRow label="No withdrawals yet" testid="no-wds" />
              ) : withdrawals.slice(0, visWd).map((w) => (
                <div key={w.id} className="flex items-center justify-between px-4 py-3 text-sm" data-testid={`profile-wd-${w.id}`}>
                  <div className="min-w-0">
                    <div className="tabular font-display font-600">{formatNaira(w.amount)}</div>
                    <div className="text-xs text-[#94A3B8] truncate">
                      {w.bank_name} · {w.account_number}
                    </div>
                    <div className="text-xs text-[#94A3B8]">{new Date(w.created_at).toLocaleString()}</div>
                  </div>
                  <StatusPill status={w.status} />
                </div>
              ))}
            </Card>
            <LoadMore shown={Math.min(visWd, withdrawals.length)} total={withdrawals.length} onMore={setVisWd} testid="load-more-wds" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ProfileLink({ to, icon: Icon, label, hint, testid }) {
  return (
    <Link
      to={to}
      data-testid={testid}
      className="flex items-center gap-3 px-5 py-4 hover:bg-[#121E30] transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
        <Icon className="w-4 h-4 text-[#0055FF]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-600 text-sm truncate">{label}</div>
        <div className="text-xs text-[#94A3B8] truncate">{hint}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
    </Link>
  );
}

function EmptyRow({ label, testid }) {
  return (
    <div className="p-8 text-center text-sm text-[#94A3B8]" data-testid={testid}>
      {label}
    </div>
  );
}
