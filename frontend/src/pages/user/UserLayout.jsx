import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Home, Store, Users, User, TrendingUp, Shield, Boxes, LogIn, ArrowLeft, X, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { isImpersonatingTab } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";

const NAV = [
  { to: "/dashboard",   label: "Home",        icon: Home,      testid: "botnav-home" },
  { to: "/marketplace", label: "Shop",        icon: Store,  testid: "botnav-invest" },
  { to: "/investments", label: "Warehouse",   icon: Boxes,  testid: "botnav-portfolio" },
  { to: "/referrals",   label: "Team",        icon: Users,  testid: "botnav-referrals" },
  { to: "/profile",     label: "Profile",     icon: User,      testid: "botnav-profile" },
];

function ImpersonationPill() {
  const { user, stopImpersonation, isImpersonating } = useAuth();
  const [loading, setLoading] = useState(false);
  const inTabImp = isImpersonatingTab();
  const inCookieImp = isImpersonating();
  if (!inTabImp && !inCookieImp) return null;

  // New tab-scoped impersonation: closing this tab returns admin cleanly. No cookie mutation.
  if (inTabImp) {
    return (
      <div
        data-testid="impersonation-pill"
        className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100%-1.5rem)]"
      >
        <div className="flex items-center gap-2 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#F59E0B] backdrop-blur px-3 py-1.5 shadow-lg">
          <LogIn className="w-3 h-3" />
          <span className="text-[11px] font-medium truncate">
            Admin view: <b>{user?.name}</b>
          </span>
          <button
            onClick={() => window.close()}
            data-testid="impersonation-close-tab"
            className="text-[11px] font-medium underline underline-offset-2 hover:no-underline inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Close
          </button>
        </div>
      </div>
    );
  }

  // Legacy cookie-swap flow (kept for backwards compatibility with any older admin sessions).
  const returnToAdmin = async () => {
    setLoading(true);
    try {
      await stopImpersonation();
      toast.success("Back to admin");
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
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--nb-page)] text-[var(--nb-text)] flex flex-col">
      <ImpersonationPill />
      {/* Top bar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--nb-page)]/80 border-b border-[var(--nb-border)]">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-5 py-4">
          <Link to="/dashboard" className="flex items-center gap-2" data-testid="user-brand-link">
            <div
              className="w-8 h-8 rounded-md grid place-items-center"
              style={{
                background: "linear-gradient(135deg,#FFE580,#F5C518)",
                boxShadow: "0 4px 14px rgba(245,197,24,0.45)",
                color: "#1A1508",
              }}
            >
              <TrendingUp className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-lg">Luckycart Box</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              data-testid="theme-toggle"
              aria-label="Toggle theme"
              className="w-9 h-9 rounded-full grid place-items-center border transition-colors"
              style={{
                borderColor: "rgba(245,197,24,0.35)",
                background: "rgba(245,197,24,0.10)",
                color: "#F5C518",
              }}
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            {user?.role === "admin" && (
              <Link to="/admin" data-testid="user-admin-link"
                    className="hidden sm:inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-[#A855F7]/40 text-[#A855F7] hover:bg-[#A855F7]/10">
                <Shield className="w-3 h-3" /> Admin
              </Link>
            )}
            <div
              className="w-9 h-9 rounded-full grid place-items-center text-sm font-display font-800"
              style={{
                background: "linear-gradient(135deg,#FFE580,#F5C518)",
                color: "#1A1508",
                boxShadow: "0 4px 12px rgba(245,197,24,0.35)",
              }}
            >
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
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--nb-border)] bg-[var(--nb-card)]/95 backdrop-blur-xl"
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
                    ? "text-[#F5C518]"
                    : "text-[var(--nb-muted)] hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[11px] font-display font-700">{n.label}</span>
                  <span
                    className="h-0.5 w-6 rounded-full"
                    style={{
                      background: isActive
                        ? "linear-gradient(90deg,#FFE580,#F5C518)"
                        : "transparent",
                      boxShadow: isActive ? "0 0 8px rgba(245,197,24,0.6)" : "none",
                    }}
                  />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
