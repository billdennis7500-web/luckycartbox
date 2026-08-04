import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Gift } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const [form, setForm] = useState({ name: "", phone: "", password: "", referral_code: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ref = sp.get("ref");
    if (ref) setForm((f) => ({ ...f, referral_code: ref }));
  }, [sp]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const u = await register(form);
      toast.success("Account created! ₦500 welcome bonus credited 🎉");
      nav(u.role === "admin" ? "/admin" : "/dashboard");
    } catch (e2) {
      setErr(e2.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[var(--nb-page)]">
      <div className="flex items-center justify-center p-6 lg:p-12 order-2 lg:order-1">
        <div className="w-full max-w-md">
          <h2 className="font-display text-3xl font-800 tracking-tight">Create your account</h2>
          <p className="text-[var(--nb-muted)] mt-2">Sign up in seconds. Claim your ₦500 welcome bonus.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="name" className="text-[var(--nb-text)]">Full name</Label>
              <Input id="name" data-testid="register-name-input" value={form.name} onChange={set("name")} required
                     className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
            </div>
            <div>
              <Label htmlFor="phone" className="text-[var(--nb-text)]">Phone number</Label>
              <Input id="phone" data-testid="register-phone-input" value={form.phone} onChange={set("phone")} required
                     placeholder="08012345678"
                     className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white placeholder:text-[var(--nb-muted)]/60 h-11" />
            </div>
            <div>
              <Label htmlFor="password" className="text-[var(--nb-text)]">Password</Label>
              <Input id="password" data-testid="register-password-input" type="password" value={form.password}
                     onChange={set("password")} required minLength={6}
                     className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
              <p className="text-xs text-[var(--nb-muted)] mt-1">At least 6 characters.</p>
            </div>
            <div>
              <Label htmlFor="referral_code" className="text-[var(--nb-text)]">Referral code <span className="text-[var(--nb-muted)]">(optional)</span></Label>
              <Input id="referral_code" data-testid="register-referral-input" value={form.referral_code}
                     onChange={set("referral_code")}
                     className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11 uppercase" />
            </div>
            {err && <div data-testid="register-error" className="text-sm text-[#EF4444]">{err}</div>}
            <Button type="submit" disabled={loading} data-testid="register-submit-button"
                    className="w-full h-11 bg-[#0055FF] hover:bg-[#3377FF] rounded-md glow-primary">
              {loading ? "Creating…" : "Create account"}
            </Button>
          </form>

          <p className="text-sm text-[var(--nb-muted)] mt-6 text-center">
            Already have an account?{" "}
            <Link to="/login" data-testid="register-to-login-link" className="text-[#0055FF] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-col justify-between p-12 border-l border-[var(--nb-border)] relative overflow-hidden order-1 lg:order-2">
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#0055FF]/20 blur-[140px]" />
        <Link to="/" className="flex items-center gap-2 relative z-10">
          <div className="w-9 h-9 rounded-md bg-[#0055FF] grid place-items-center glow-primary">
            <TrendingUp className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-xl">Luckycart Box</span>
        </Link>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0055FF]/15 border border-[#0055FF]/40 text-xs text-white mb-6">
            <Gift className="w-3 h-3" /> ₦500 welcome bonus
          </div>
          <h1 className="font-display text-4xl font-800 tracking-tight leading-tight">
            Nigeria's smartest way to grow your naira.
          </h1>
          <p className="text-[var(--nb-muted)] mt-4 max-w-md">
            Automated daily profits, 3-generation referrals, instant bank withdrawals.
          </p>
        </div>
        <div className="text-xs text-[var(--nb-muted)] relative z-10">© 2026 Luckycart Box</div>
      </div>
    </div>
  );
}
