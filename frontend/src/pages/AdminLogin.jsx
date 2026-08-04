import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Lock } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";

export default function AdminLogin() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const { data } = await api.post("/auth/login", { email: email.trim().toLowerCase(), password });
      if (data.user?.role !== "admin") {
        setErr("This login is for admins only. Please use the user sign-in page.");
        setLoading(false);
        return;
      }
      setUser(data.user);
      toast.success("Signed in as admin");
      nav("/admin");
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[var(--nb-page)] text-[var(--nb-text)]">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-[var(--nb-border)] relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#0055FF]/25 blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full bg-[#0055FF]/15 blur-[120px]" />

        <Link to="/" className="flex items-center gap-2 relative z-10" data-testid="admin-login-brand">
          <BrandLogo size={36} />
          <span className="font-display font-bold text-xl">Luckycart Box</span>
        </Link>

        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0055FF]/15 border border-[#0055FF]/40 text-xs">
            <Shield className="w-3 h-3 text-[#0055FF]" /> Admin control panel
          </div>
          <h1 className="font-display text-4xl font-800 tracking-tight leading-tight">
            Approve, configure, control.
          </h1>
          <p className="text-[var(--nb-muted)] max-w-md leading-relaxed">
            Manage users, plans, deposits, withdrawals, referral rates and gateway settings from a single dashboard.
          </p>
        </div>

        <div className="text-xs text-[var(--nb-muted)] relative z-10">© 2026 Luckycart Box</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--nb-card)] border border-[var(--nb-border)] text-xs text-[var(--nb-muted)] mb-4">
            <Lock className="w-3 h-3 text-[#0055FF]" /> Admin sign in
          </div>
          <h2 className="font-display text-3xl font-800 tracking-tight">Welcome, admin</h2>
          <p className="text-[var(--nb-muted)] mt-2">Sign in with your admin email and password.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="email" className="text-[var(--nb-text)]">Email</Label>
              <Input
                id="email"
                type="email"
                data-testid="admin-login-email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white placeholder:text-[var(--nb-muted)]/60 h-11"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-[var(--nb-text)]">Password</Label>
              <Input
                id="password"
                type="password"
                data-testid="admin-login-password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
              />
            </div>
            {err && <div data-testid="admin-login-error" className="text-sm text-[#EF4444]">{err}</div>}
            <Button
              type="submit"
              disabled={loading}
              data-testid="admin-login-submit-button"
              className="w-full h-11 bg-[#0055FF] hover:bg-[#3377FF] rounded-md glow-primary"
            >
              {loading ? "Signing in…" : "Enter admin panel"}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link to="/login" data-testid="admin-to-user-login" className="text-[var(--nb-muted)] hover:text-white">
              ← User sign in
            </Link>
            <Link to="/" className="text-[var(--nb-muted)] hover:text-white">Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
