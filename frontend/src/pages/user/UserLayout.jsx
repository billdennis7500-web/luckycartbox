import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Home, Store, Users, User, TrendingUp, Shield, LineChart, LogIn, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const NAV = [
  { to: "/dashboard",   label: "Home",        icon: Home,      testid: "botnav-home" },
  { to: "/marketplace", label: "Invest",      icon: Store,     testid: "botnav-invest" },
  { to: "/investments", label: "Portfolio",   icon: LineChart, testid: "botnav-portfolio" },
  { to: "/referrals",   label: "Referrals",   icon: Users,     testid: "botnav-referrals" },
  { to: "/profile",     label: "Profile",     icon: User,      testid: "botnav-profile" },
];

function ImpersonationPill() {
  const { user, stopImpersonation, isImpersonating } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  if (!isImpersonating()) return null;
  const returnToAdmin = async () => {
    setLoading(true);
    try {
      await stopImpersonation();
      toast.success("Back to admin");
      // Force a hard reload so cookies + AuthContext resynchronize before AdminLayout mounts.
      window.location.assign("/admin");
    } catch {
      toast.error("Couldn't switch back — try logging in again");
      setLoading(false);
    }
  };
  return (
    <div
      data-testid="impersonation-pill"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100%-1.5rem)]"
    >
      <div className="flex items-center gap-2 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#F59E0B] backdrop-blur px-3 py-1.5 shadow-lg">
        <LogIn className="w-3 h-3" />
        <span className="text-[11px] font-medium truncate">
          Viewing as <b>{user?.name}</b>
        </span>
        <button
          onClick={returnToAdmin}
          disabled={loading}
          data-testid="impersonation-return-btn"
          className="text-[11px] font-medium underline underline-offset-2 hover:no-underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Return
        </button>
      </div>
    </div>
  );
}

export default function UserLayout() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#020813] text-[#F8FAFC] flex flex-col">
      <ImpersonationPill />
      {/* Top bar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#020813]/80 border-b border-[#1A2B44]">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-5 py-4">
          <Link to="/dashboard" className="flex items-center gap-2" data-testid="user-brand-link">
            <div className="w-8 h-8 rounded-md bg-[#0055FF] grid place-items-center glow-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-lg">NaijaInvest</span>
          </Link>
          <div className="flex items-center gap-3">
            {user?.role === "admin" && (
              <Link to="/admin" data-testid="user-admin-link"
                    className="hidden sm:inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-[#0055FF]/40 text-[#0055FF] hover:bg-[#0055FF]/10">
                <Shield className="w-3 h-3" /> Admin
              </Link>
            )}
            <div className="w-9 h-9 rounded-full bg-[#0055FF]/20 border border-[#0055FF]/40 grid place-items-center text-sm font-medium">
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-5 pt-6 pb-32">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav
        data-testid="bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#1A2B44] bg-[#0B1524]/95 backdrop-blur-xl"
      >
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={n.testid}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
                  isActive
                    ? "text-[#0055FF]"
                    : "text-[#94A3B8] hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className={`w-5 h-5 ${isActive ? "" : ""}`} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[11px] font-medium">{n.label}</span>
                  <span className={`h-0.5 w-6 rounded-full ${isActive ? "bg-[#0055FF]" : "bg-transparent"}`} />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
