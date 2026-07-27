import React, { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  LayoutDashboard, Users, PackageOpen, ArrowDownToLine, ArrowUpFromLine,
  Percent, Ticket, Landmark, Settings, LogOut, Shield, Menu, X, ExternalLink,
} from "lucide-react";

const NAV = [
  { to: "/admin", end: true, label: "Overview", icon: LayoutDashboard, key: null },
  { to: "/admin/users", label: "Users", icon: Users, key: null },
  { to: "/admin/products", label: "Products", icon: PackageOpen, key: null },
  { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine, key: "pending_deposits" },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, key: "pending_withdrawals" },
  { to: "/admin/referrals", label: "Referrals", icon: Percent, key: null },
  { to: "/admin/coupons", label: "Coupons", icon: Ticket, key: null },
  { to: "/admin/accounts", label: "Payment accounts", icon: Landmark, key: null },
  { to: "/admin/settings", label: "Settings", icon: Settings, key: null },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({});
  const onLogout = async () => { await logout(); nav("/"); };

  useEffect(() => {
    const load = () => api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#020813] text-[#F8FAFC] flex">
      <aside className={`fixed lg:sticky top-0 left-0 z-30 h-screen w-64 bg-[#0B1524] border-r border-[#1A2B44] transform transition-transform ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-[#1A2B44]">
          <Link to="/admin" className="flex items-center gap-2" data-testid="admin-brand-link">
            <div className="w-8 h-8 rounded-md bg-[#0055FF] grid place-items-center glow-primary">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none">Admin</div>
              <div className="text-[10px] uppercase tracking-widest text-[#94A3B8]">NaijaInvest</div>
            </div>
          </Link>
          <button onClick={() => setOpen(false)} className="lg:hidden text-[#94A3B8]"><X className="w-5 h-5"/></button>
        </div>

        <div className="px-3 py-5 space-y-1 overflow-y-auto max-h-[calc(100vh-14rem)]">
          {NAV.map((n) => {
            const badge = n.key ? Number(stats[n.key] || 0) : 0;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setOpen(false)}
                data-testid={`admin-nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-[#0055FF]/15 text-white border border-[#0055FF]/40"
                      : "text-[#94A3B8] hover:text-white hover:bg-[#121E30] border border-transparent"
                  }`
                }
              >
                <n.icon className="w-4 h-4" />
                <span className="flex-1">{n.label}</span>
                {badge > 0 && (
                  <span
                    data-testid={`admin-nav-badge-${n.key}`}
                    className="text-[10px] tabular font-800 px-1.5 py-0.5 rounded-full bg-[#F59E0B] text-white"
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-3 pb-5 space-y-2">
          <Link to="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-[#94A3B8] hover:text-white hover:bg-[#121E30] border border-transparent">
            <ExternalLink className="w-4 h-4" /> User view
          </Link>
          <button onClick={onLogout} data-testid="admin-logout-button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-[#94A3B8] hover:text-white hover:bg-[#121E30] border border-transparent">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#020813]/70 border-b border-[#1A2B44]">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setOpen(true)} className="lg:hidden text-[#94A3B8]"><Menu className="w-5 h-5"/></button>
              <div>
                <div className="text-xs uppercase tracking-widest text-[#94A3B8]">Admin panel</div>
                <div className="font-display font-800 text-lg">Control center</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">{user?.name}</div>
                <div className="text-xs text-[#94A3B8]">{user?.phone}</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#0055FF]/20 border border-[#0055FF]/40 grid place-items-center text-sm font-medium">A</div>
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
