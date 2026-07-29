/**
 * ChangePassword — /change-password
 *
 * Authenticated password change form. Calls `POST /api/auth/change-password`
 * with current + new password. Client-side validation mirrors the server
 * (min 6 chars, new must differ from current, confirm must match).
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Lock, Eye, EyeOff, ShieldCheck, ChevronRight } from "lucide-react";
import { SoftCard, MicroLabel } from "@/components/design";

function PasswordField({ label, value, onChange, testid, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-[#F5C518]/85 font-display font-700">{label}</Label>
      <div className="mt-1.5 relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testid}
          autoComplete={autoComplete}
          className="pr-10 bg-[var(--nb-card2)] border-[#F5C518]/30 focus:border-[#F5C518]/60 text-white h-11"
          minLength={6}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          data-testid={`${testid}-toggle`}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center text-[var(--nb-muted)] hover:text-white"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePassword() {
  const nav = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!current || !next || !confirm) {
      toast.error("Fill all three fields");
      return;
    }
    if (next.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (next === current) {
      toast.error("New password must be different from your current one");
      return;
    }
    if (next !== confirm) {
      toast.error("New password and confirmation don't match");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password updated. Keep it safe.");
      setCurrent(""); setNext(""); setConfirm("");
      nav("/profile");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/profile" data-testid="cp-back"
            className="inline-flex items-center gap-1 text-xs text-[var(--nb-muted)] hover:text-white transition-colors">
        <ArrowLeft className="w-3 h-3" /> Back to profile
      </Link>

      {/* Hero */}
      <div
        className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-5 text-center"
        style={{ boxShadow: "0 10px 30px -10px rgba(0,85,255,0.45), 0 0 0 1px rgba(0,85,255,0.30)" }}
        data-testid="cp-hero"
      >
        <div className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
             style={{ background: "repeating-linear-gradient(90deg,#0055FF 0 10px,transparent 10px 18px)", opacity: 0.7 }} />
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-25 blur-2xl pointer-events-none"
             style={{ background: "#0055FF" }} />
        <div
          className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-3"
          style={{
            background: "linear-gradient(135deg,#3377FF,#0055FF)",
            color: "#FFFFFF",
            boxShadow: "0 8px 22px rgba(0,85,255,0.55)",
          }}
        >
          <Lock className="w-6 h-6" strokeWidth={2.4} />
        </div>
        <div className="relative">
          <MicroLabel tone="epic" className="!mt-0 justify-center">Security</MicroLabel>
          <div className="font-display font-800 text-xl text-white mt-1">Change your password</div>
          <div className="text-xs text-[var(--nb-muted)] mt-1">
            Use at least 6 characters. Mix letters and numbers for extra safety.
          </div>
        </div>
      </div>

      {/* Form */}
      <SoftCard testid="cp-form-card">
        <form onSubmit={submit} className="space-y-4">
          <PasswordField
            label="Current password"
            value={current}
            onChange={setCurrent}
            testid="cp-current"
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            value={next}
            onChange={setNext}
            testid="cp-new"
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            testid="cp-confirm"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={loading}
            data-testid="cp-submit"
            className="w-full h-12 rounded-full font-display font-800 text-[15px] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg,#FFE580,#F5C518)",
              color: "#1A1508",
              boxShadow: "0 10px 28px -8px rgba(245,197,24,0.55)",
            }}
          >
            {loading ? "Updating…" : "Update password"}
            {!loading && <ChevronRight className="w-4 h-4" />}
          </button>
        </form>
      </SoftCard>

      {/* Tips */}
      <div
        className="relative rounded-2xl overflow-hidden bg-[var(--nb-card)] p-4 flex items-start gap-3"
        style={{ boxShadow: "0 4px 16px -6px rgba(16,185,129,0.35), 0 0 0 1px rgba(16,185,129,0.30)" }}
      >
        <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0"
             style={{ background: "#10B98118", border: "1px solid #10B98140", color: "#10B981" }}>
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="text-xs text-[var(--nb-muted)] leading-relaxed">
          Never share your password. NaijaInvest support will never ask for it. If you suspect your account is compromised, change it here immediately and message Customer Service.
        </div>
      </div>
    </div>
  );
}
