import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Store, ArrowDownToLine, ArrowUpFromLine,
  Users, Ticket, Receipt, LogOut, TrendingUp, Menu, X, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/api";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/marketplace", label: "Invest", icon: Store },
  { to: "/deposit", label: "Deposit", icon: ArrowDownToLine },
  { to: "/withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { to: "/referrals", label: "Referrals", icon: Users },
  { to: "/coupon", label: "Redeem", icon: Ticket },
  { to: "/transactions", label: "Transactions", icon: Receipt },
];

export default function UserLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const onLogout = async () => { await logout(); nav("/"); };

  return (
    <div className="min-h-screen bg-[#020813] text-[#F8FAFC] flex">
      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 z-30 h-screen w-64 bg-[#0B1524] border-r border-[#1A2B44] transform transition-transform ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-[#1A2B44]">
          <Link to="/dashboard" className="flex items-center gap-2" data-testid="user-brand-link">
            <div className="w-8 h-8 rounded-md bg-[#0055FF] grid place-items-center glow-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-lg">NaijaInvest</span>
          </Link>
          <button onClick={() => setOpen(false)} className="lg:hidden text-[#94A3B8]"><X className="w-5 h-5"/></button>
        </div>

        <div className="px-3 py-5 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.to.slice(1)}-link`}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-[#0055FF]/15 text-white border border-[#0055FF]/40"
                    : "text-[#94A3B8] hover:text-white hover:bg-[#121E30] border border-transparent"
                }`
              }
            >
              <n.icon className="w-4 h-4" /> {n.label}
            </NavLink>
          ))}
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-3 pb-5 space-y-2">
          {user?.role === "admin" && (
            <Link to="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-[#0055FF] border border-[#0055FF]/30 hover:bg-[#0055FF]/10">
              <Shield className="w-4 h-4" /> Admin panel
            </Link>
          )}
          <button
            onClick={onLogout}
            data-testid="user-logout-button"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-[#94A3B8] hover:text-white hover:bg-[#121E30] border border-transparent"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:pl-0 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#020813]/70 border-b border-[#1A2B44]">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setOpen(true)} className="lg:hidden text-[#94A3B8]"><Menu className="w-5 h-5"/></button>
              <div>
                <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Wallet balance</div>
                <div className="font-display font-800 text-xl tabular" data-testid="topbar-wallet-balance">{formatNaira(user?.wallet_balance)}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium" data-testid="topbar-user-name">{user?.name}</div>
                <div className="text-xs text-[#94A3B8]" data-testid="topbar-user-phone">{user?.phone}</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#0055FF]/20 border border-[#0055FF]/40 grid place-items-center text-sm font-medium">
                {(user?.name || "?").slice(0, 1).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="p-6 lg:p-8 max-w-7xl">
          <Outlet />
        </main>
      </div>

      {open && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setOpen(false)} />}
    </div>
  );
}
