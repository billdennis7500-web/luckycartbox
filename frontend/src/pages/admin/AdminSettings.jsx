import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, AlertTriangle, Trash2, Loader2 } from "lucide-react";

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [pn, setPn] = useState(null);

  useEffect(() => {
    api.get("/admin/settings").then((r) => setS(r.data));
    api.get("/admin/paynow/status").then((r) => setPn(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    try {
      // Parse quick amounts (comma or newline separated string → array of numbers)
      const quickRaw = (typeof s.deposit_quick_amounts === "string"
        ? s.deposit_quick_amounts
        : (s.deposit_quick_amounts || []).join(", ")
      );
      const quickAmounts = String(quickRaw)
        .split(/[,\n]/)
        .map((x) => Number(String(x).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);

      await api.put("/admin/settings", {
        welcome_bonus: Number(s.welcome_bonus),
        min_deposit: Number(s.min_deposit),
        min_withdrawal: Number(s.min_withdrawal),
        site_name: s.site_name,
        telegram_url: (s.telegram_url || "").trim(),
        welcome_message: (s.welcome_message || "").trim(),
        withdrawal_fee_pct: Number(s.withdrawal_fee_pct) || 0,
        auto_payout_enabled: !!s.auto_payout_enabled,
        deposit_quick_amounts: quickAmounts,
        batch_approve_limit: Math.max(1, Number(s.batch_approve_limit) || 50),
      });
      toast.success("Settings saved");
      // Normalize the local state after save
      setS({ ...s, deposit_quick_amounts: quickAmounts });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  const copy = (v) => { navigator.clipboard.writeText(v); toast.success("Copied"); };
  const base = process.env.REACT_APP_BACKEND_URL || "";
  const payinHook = `${base}/api/webhooks/paynow/payin`;
  const payoutHook = `${base}/api/webhooks/paynow/payout`;

  if (!s) return <div className="text-[var(--nb-muted)]">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-settings-heading">Platform settings</h1>
        <p className="text-[var(--nb-muted)] mt-2">Welcome bonus, limits, branding, gateway webhook URLs.</p>
      </div>
      <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] p-6 rounded-xl space-y-4">
        <div>
          <Label>Site name</Label>
          <Input value={s.site_name} onChange={(e) => setS({ ...s, site_name: e.target.value })}
                 data-testid="setting-sitename"
                 className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
        </div>
        <div>
          <Label>Welcome bonus (₦)</Label>
          <Input type="number" value={s.welcome_bonus} onChange={(e) => setS({ ...s, welcome_bonus: e.target.value })}
                 data-testid="setting-welcome"
                 className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Minimum deposit (₦)</Label>
            <Input type="number" value={s.min_deposit} onChange={(e) => setS({ ...s, min_deposit: e.target.value })}
                   data-testid="setting-mindep"
                   className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
          </div>
          <div>
            <Label>Minimum withdrawal (₦)</Label>
            <Input type="number" value={s.min_withdrawal} onChange={(e) => setS({ ...s, min_withdrawal: e.target.value })}
                   data-testid="setting-minwd"
                   className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--nb-border)]">
          <div className="text-xs uppercase tracking-widest text-[var(--nb-muted)] mb-3">Community & welcome pop-up</div>
          <Label>Telegram community URL</Label>
          <Input
            value={s.telegram_url || ""}
            onChange={(e) => setS({ ...s, telegram_url: e.target.value })}
            placeholder="https://t.me/your-community"
            data-testid="setting-telegram-url"
            className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
          />
          <p className="text-xs text-[var(--nb-muted)] mt-1">Shown as a "Join Telegram" chip on the user dashboard and welcome modal.</p>

          <div className="mt-4">
            <Label>Welcome pop-up message</Label>
            <textarea
              value={s.welcome_message || ""}
              onChange={(e) => setS({ ...s, welcome_message: e.target.value })}
              rows={3}
              placeholder="Shown to users when they open or refresh the home page."
              data-testid="setting-welcome-message"
              className="mt-2 w-full rounded-md bg-[var(--nb-card2)] border border-[var(--nb-border)] text-white px-3 py-2 text-sm focus:outline-none focus:border-[#0055FF]/40"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--nb-border)]">
          <div className="text-xs uppercase tracking-widest text-[var(--nb-muted)] mb-3">Withdrawals</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Platform fee (%)</Label>
              <Input type="number" step="0.01" min="0" max="100"
                     value={s.withdrawal_fee_pct ?? 0}
                     onChange={(e) => setS({ ...s, withdrawal_fee_pct: e.target.value })}
                     data-testid="setting-withdrawal-fee"
                     className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11 tabular" />
              <p className="text-xs text-[var(--nb-muted)] mt-1">Deducted from every withdrawal. 0 disables the fee.</p>
            </div>
            <div>
              <Label>Bulk approve limit</Label>
              <Input type="number" min="1" max="500"
                     value={s.batch_approve_limit ?? 50}
                     onChange={(e) => setS({ ...s, batch_approve_limit: e.target.value })}
                     data-testid="setting-batch-limit"
                     className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11 tabular" />
              <p className="text-xs text-[var(--nb-muted)] mt-1">Max withdrawals you can approve at once.</p>
            </div>
          </div>
          <label className="mt-4 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!s.auto_payout_enabled}
              onChange={(e) => setS({ ...s, auto_payout_enabled: e.target.checked })}
              data-testid="setting-auto-payout"
              className="mt-1 w-4 h-4 accent-[#0055FF]"
            />
            <div>
              <div className="text-sm font-display font-600">
                Auto-payout {s.auto_payout_enabled ? <span className="text-[#10B981]">(ON)</span> : <span className="text-[#F59E0B]">(OFF — manual approval)</span>}
              </div>
              <div className="text-xs text-[var(--nb-muted)]">
                When ON, user withdrawals fire the gateway immediately. When OFF, admin must approve manually — recommended for higher control.
              </div>
            </div>
          </label>
        </div>

        <div className="pt-3 border-t border-[var(--nb-border)]">
          <div className="text-xs uppercase tracking-widest text-[var(--nb-muted)] mb-3">Deposit page</div>
          <Label>Quick amount presets (₦)</Label>
          <Input
            value={
              typeof s.deposit_quick_amounts === "string"
                ? s.deposit_quick_amounts
                : (s.deposit_quick_amounts || []).join(", ")
            }
            onChange={(e) => setS({ ...s, deposit_quick_amounts: e.target.value })}
            placeholder="500, 1000, 2000, 5000, 10000, 20000"
            data-testid="setting-quick-amounts"
            className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11 tabular"
          />
          <p className="text-xs text-[var(--nb-muted)] mt-1">Comma-separated. Rendered as chips on the user deposit page.</p>
        </div>

        <Button onClick={save} data-testid="setting-save-btn" className="bg-[#0055FF] hover:bg-[#3377FF]">Save</Button>
      </Card>

      {pn?.enabled && (
        <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] p-6 rounded-xl space-y-4">
          <div>
            <h2 className="font-display text-lg font-600">PayNow webhook URLs</h2>
            <p className="text-xs text-[var(--nb-muted)] mt-1">Paste these in your PayNow merchant dashboard to enable auto-crediting and payout callbacks.</p>
          </div>
          {[
            ["Payin (deposit) callback URL", payinHook, "payin-webhook"],
            ["Payout (withdrawal) callback URL", payoutHook, "payout-webhook"],
          ].map(([label, url, tid]) => (
            <div key={label}>
              <Label>{label}</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input readOnly value={url} data-testid={tid}
                       className="bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
                <Button variant="outline" onClick={() => copy(url)} className="border-[var(--nb-border)] bg-transparent text-white">
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
            </div>
          ))}
          <div className="text-xs text-[var(--nb-muted)] pt-2 border-t border-[var(--nb-border)]">
            Configure a server IP whitelist in the PayNow dashboard for the payout, statement and balance endpoints (required by PayNow).
          </div>
        </Card>
      )}

      <GatewayTogglesCard />

      <DangerZoneCard />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Payment Gateway toggles — admin can enable/disable each gateway for       */
/*  payin (collections) and payout (withdrawals) independently.                */
/* -------------------------------------------------------------------------- */

function GatewayTogglesCard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/admin/gateways")
      .then((r) => setRows(r.data?.gateways || []))
      .catch(() => toast.error("Failed to load gateway toggles"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setToggle = async (key, direction, value) => {
    setSaving(true);
    try {
      const patch = { [key]: { [direction]: value } };
      const { data } = await api.put("/admin/gateways", patch);
      setRows(data?.gateways || []);
      toast.success(`${key} ${direction} ${value ? "enabled" : "disabled"}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      className="bg-[var(--nb-card)] border-[var(--nb-border)] p-6 rounded-xl space-y-4"
      data-testid="admin-gateway-toggles-card"
    >
      <div>
        <h2 className="font-display text-lg font-600">Payment Gateways</h2>
        <p className="text-xs text-[var(--nb-muted)] mt-1">
          Turn each gateway ON/OFF for <span className="text-white">collection</span> (deposits) and{" "}
          <span className="text-white">payout</span> (withdrawals) independently. Users only see the gateways you enable for collection.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--nb-muted)]">Loading gateways…</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.key}
              className="rounded-xl border border-[var(--nb-border)] bg-[var(--nb-card2)] p-4"
              data-testid={`gateway-row-${row.key}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
                  style={{ background: `${row.color}20`, color: row.color, border: `1px solid ${row.color}40` }}
                >
                  <span className="font-display font-800 text-xs">{row.key.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-700 text-white truncate">{row.label}</div>
                  <div className="text-[11px] text-[var(--nb-muted)]">
                    {row.configured ? "Configured" : "Not configured in .env"}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ToggleChip
                  label="Collection (payin)"
                  value={row.payin}
                  disabled={!row.configured || saving}
                  onChange={(v) => setToggle(row.key, "payin", v)}
                  testid={`toggle-${row.key}-payin`}
                />
                <ToggleChip
                  label="Payout"
                  value={row.payout}
                  disabled={!row.configured || saving}
                  onChange={(v) => setToggle(row.key, "payout", v)}
                  testid={`toggle-${row.key}-payout`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ToggleChip({ label, value, disabled, onChange, testid }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      data-testid={testid}
      className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
        value
          ? "border-[#10B981]/40 bg-[#10B981]/10 text-white"
          : "border-[var(--nb-border)] bg-[var(--nb-card)] text-[var(--nb-muted)]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-[#0055FF]/40"}`}
    >
      <span className="text-xs font-display font-600">{label}</span>
      <span
        className={`w-9 h-5 rounded-full relative transition-colors ${
          value ? "bg-[#10B981]" : "bg-[var(--nb-border)]"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
            value ? "left-4" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}


/* -------------------------------------------------------------------------- */
/*  Danger Zone — wipe all user data                                          */
/* -------------------------------------------------------------------------- */

function DangerZoneCard() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const PHRASE = "DELETE ALL DATA";

  const submit = async () => {
    if (phrase.trim() !== PHRASE) {
      toast.error(`Type "${PHRASE}" exactly to confirm`);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/admin/reset", { confirm: PHRASE });
      setResult(data);
      toast.success(
        `Platform wiped · ${data.users_deleted} users removed`,
        {
          description: `Deposits ${data.deposits_deleted} · Withdrawals ${data.withdrawals_deleted} · Investments ${data.investments_deleted} · Transactions ${data.transactions_deleted}`,
        },
      );
      setPhrase("");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPhrase("");
    setResult(null);
  };

  return (
    <Card
      className="bg-[#3b0d10] border border-[#EF4444]/40 p-5 rounded-2xl"
      data-testid="admin-danger-zone-card"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#EF4444]/20 border border-[#EF4444]/40 shrink-0">
          <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg font-700 text-white">Danger zone</h3>
          <p className="text-xs text-[#FCA5A5] mt-1 leading-relaxed">
            Wipe every regular user + all deposits, withdrawals, investments and transactions.
            Admin accounts, products, payment accounts, and platform settings are preserved.
            This action cannot be undone.
          </p>

          <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
            <DialogTrigger asChild>
              <Button
                className="mt-4 bg-[#EF4444] hover:bg-[#dc2626] text-white rounded-xl"
                data-testid="open-reset-dialog-btn"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear all user data
              </Button>
            </DialogTrigger>
            <DialogContent
              className="bg-[var(--nb-card)] border-[var(--nb-border)] text-white max-w-md"
              data-testid="reset-confirmation-dialog"
            >
              {!result ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="font-display flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
                      Wipe all user data?
                    </DialogTitle>
                    <DialogDescription className="text-[var(--nb-muted)] text-xs leading-relaxed">
                      This removes every non-admin user and every deposit, withdrawal,
                      investment, and transaction on the platform. Admin accounts,
                      products, payment accounts, and settings stay.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2 pt-2">
                    <Label className="text-xs text-[var(--nb-muted)]">
                      Type <span className="font-display font-700 text-[#EF4444]">{PHRASE}</span> to enable the button
                    </Label>
                    <Input
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder={PHRASE}
                      autoFocus
                      disabled={busy}
                      className="bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
                      data-testid="reset-confirm-input"
                    />
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={close}
                      disabled={busy}
                      className="border-[var(--nb-border)] bg-transparent text-white"
                      data-testid="reset-cancel-btn"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={submit}
                      disabled={busy || phrase.trim() !== PHRASE}
                      className="bg-[#EF4444] hover:bg-[#dc2626] text-white disabled:opacity-40"
                      data-testid="reset-confirm-btn"
                    >
                      {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                      Wipe platform
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="font-display">Reset complete</DialogTitle>
                    <DialogDescription className="text-[var(--nb-muted)] text-xs">
                      The platform is now clean. Numbers below are what was removed.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-2 py-2" data-testid="reset-result-summary">
                    {[
                      ["Users", result.users_deleted],
                      ["Deposits", result.deposits_deleted],
                      ["Withdrawals", result.withdrawals_deleted],
                      ["Investments", result.investments_deleted],
                      ["Transactions", result.transactions_deleted],
                      ["Coupons reset", result.coupons_reset],
                    ].map(([label, n]) => (
                      <div key={label} className="rounded-lg border border-[var(--nb-border)] bg-[var(--nb-card2)] p-3">
                        <div className="text-[10px] uppercase text-[var(--nb-muted)] tracking-wider">{label}</div>
                        <div className="font-display font-800 text-xl tabular">{Number(n || 0).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={close}
                      className="bg-[#0055FF] hover:bg-[#3377FF] text-white"
                      data-testid="reset-done-btn"
                    >
                      Done
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Card>
  );
}

