import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const u = await login(phone, password);
      toast.success("Welcome back!");
      nav(u.role === "admin" ? "/admin" : "/dashboard");
    } catch (e2) {
      setErr(e2.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[var(--nb-page)]">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-[var(--nb-border)] relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#0055FF]/20 blur-[140px]" />
        <Link to="/" className="flex items-center gap-2 relative z-10" data-testid="login-brand-link">
          <div className="w-9 h-9 rounded-md bg-[#0055FF] grid place-items-center glow-primary">
            <TrendingUp className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-xl">Luckycart Box</span>
        </Link>
        <div className="relative z-10">
          <h1 className="font-display text-4xl font-800 tracking-tight leading-tight">
            Welcome back. Your naira is growing.
          </h1>
          <p className="text-[var(--nb-muted)] mt-4 max-w-md">
            Sign in to check your daily profits, manage investments, and cash out to your bank.
          </p>
        </div>
        <div className="text-xs text-[var(--nb-muted)] relative z-10">© 2026 Luckycart Box</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <h2 className="font-display text-3xl font-800 tracking-tight">Sign in</h2>
          <p className="text-[var(--nb-muted)] mt-2">Use your phone number and password.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="phone" className="text-[var(--nb-text)]">Phone number</Label>
              <Input
                id="phone"
                data-testid="login-phone-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08012345678"
                className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white placeholder:text-[var(--nb-muted)]/60 h-11"
                required
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-[var(--nb-text)]">Password</Label>
              <Input
                id="password"
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
                required
              />
            </div>
            {err && <div data-testid="login-error" className="text-sm text-[#EF4444]">{err}</div>}
            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full h-11 bg-[#0055FF] hover:bg-[#3377FF] rounded-md glow-primary"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-sm text-[var(--nb-muted)] mt-6 text-center">
            No account?{" "}
            <Link to="/register" data-testid="login-to-register-link" className="text-[#0055FF] hover:underline">
              Create one now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
