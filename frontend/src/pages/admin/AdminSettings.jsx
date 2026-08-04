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
import { Copy, AlertTriangle, Trash2, Loader2, Settings, CreditCard, Server, ShieldAlert } from "lucide-react";
import { SectionHeader } from "@/components/design";

const TABS = [
  { key: "general",  label: "General",  icon: Settings },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "infra",    label: "Server",   icon: Server },
  { key: "danger",   label: "Danger",   icon: ShieldAlert },
];

export default function AdminSettings() {
  const [s, setS] = useState(null);
  const [pn, setPn] = useState(null);
  const [tab, setTab] = useState("general");

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
        whatsapp_url: (s.whatsapp_url || "").trim(),
        telegram_channel_url: (s.telegram_channel_url || "").trim(),
        whatsapp_channel_url: (s.whatsapp_channel_url || "").trim(),
        support_hours: (s.support_hours || "").trim(),
        welcome_message: (s.welcome_message || "").trim(),
        withdrawal_fee_pct: Number(s.withdrawal_fee_pct) || 0,
        auto_payout_enabled: !!s.auto_payout_enabled,
        deposit_quick_amounts: quickAmounts,
        batch_approve_limit: Math.max(1, Number(s.batch_approve_limit) || 50),
        referral_levels: Array.isArray(s.referral_levels) ? s.referral_levels.map((l) => ({
          level: Number(l.level) || 0,
          name: String(l.name || "").trim() || `Level ${l.level}`,
          icon: String(l.icon || "gem").trim(),
          color: String(l.color || "#F5C518").trim(),
          min_referrals: Math.max(0, Number(l.min_referrals) || 0),
          reward: Math.max(0, Number(l.reward) || 0),
        })) : undefined,
        referral_level_requires_investment: !!s.referral_level_requires_investment,
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
    <div className="space-y-5 max-w-3xl">
      <SectionHeader
        title="Platform settings"
        subtitle="Branding, limits, payment gateways, infrastructure and danger zone."
        testid="admin-settings-heading"
      />

      {/* Tab bar */}
      <div className="grid grid-cols-4 gap-2 p-1 rounded-xl bg-[var(--nb-card)] border border-[var(--nb-border)] sticky top-2 z-30 backdrop-blur">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-testid={`admin-settings-tab-${key}`}
            className={`h-10 rounded-lg text-xs font-display font-700 transition-colors flex items-center justify-center gap-1.5 ${
              tab === key
                ? "bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/30"
                : "text-[var(--nb-muted)] hover:text-white"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === "general" && (
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
          <div className="text-xs uppercase tracking-widest text-[var(--nb-muted)] mb-3">Support channels & hours</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>WhatsApp DM (wa.me link)</Label>
              <Input
                value={s.whatsapp_url || ""}
                onChange={(e) => setS({ ...s, whatsapp_url: e.target.value })}
                placeholder="https://wa.me/234XXXXXXXXXX"
                data-testid="setting-whatsapp-url"
                className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
              />
            </div>
            <div>
              <Label>WhatsApp Channel</Label>
              <Input
                value={s.whatsapp_channel_url || ""}
                onChange={(e) => setS({ ...s, whatsapp_channel_url: e.target.value })}
                placeholder="https://whatsapp.com/channel/..."
                data-testid="setting-whatsapp-channel-url"
                className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
              />
            </div>
            <div>
              <Label>Telegram DM (support)</Label>
              <Input
                value={s.telegram_url || ""}
                onChange={(e) => setS({ ...s, telegram_url: e.target.value })}
                placeholder="https://t.me/yoursupport"
                data-testid="setting-telegram-url"
                className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
              />
            </div>
            <div>
              <Label>Telegram Channel</Label>
              <Input
                value={s.telegram_channel_url || ""}
                onChange={(e) => setS({ ...s, telegram_channel_url: e.target.value })}
                placeholder="https://t.me/yourchannel"
                data-testid="setting-telegram-channel-url"
                className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
              />
            </div>
          </div>
          <div className="mt-3">
            <Label>Working hours (shown on customer support)</Label>
            <Input
              value={s.support_hours || ""}
              onChange={(e) => setS({ ...s, support_hours: e.target.value })}
              placeholder="Monday to Sunday, 10:00 AM to 5:00 PM"
              data-testid="setting-support-hours"
              className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11"
            />
          </div>
          <p className="text-xs text-[var(--nb-muted)] mt-2">All four channels appear on the Customer Support page. Leave blank to hide a channel.</p>

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
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-widest text-[var(--nb-muted)]">Referral reward levels</div>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--nb-muted)] cursor-pointer" data-testid="setting-reflvl-req-inv">
              <input
                type="checkbox"
                checked={!!s.referral_level_requires_investment}
                onChange={(e) => setS({ ...s, referral_level_requires_investment: e.target.checked })}
                className="accent-[#F5C518] w-4 h-4"
              />
              Only count referrals who have invested
            </label>
          </div>
          <p className="text-xs text-[var(--nb-muted)] mb-3">Users see these as milestone bonuses on the Rewards page. Editing thresholds after users have claimed will not reverse past claims.</p>
          <div className="space-y-2">
            {(s.referral_levels || []).map((lvl, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center bg-[var(--nb-card2)] p-2 rounded-md border border-[var(--nb-border)]" data-testid={`setting-reflvl-row-${i}`}>
                <div className="col-span-1 text-xs text-[var(--nb-muted)] tabular text-center">#{lvl.level}</div>
                <Input
                  value={lvl.name || ""}
                  onChange={(e) => {
                    const next = [...s.referral_levels]; next[i] = { ...lvl, name: e.target.value }; setS({ ...s, referral_levels: next });
                  }}
                  placeholder="Ignite"
                  data-testid={`setting-reflvl-${i}-name`}
                  className="col-span-3 bg-[var(--nb-card)] border-[var(--nb-border)] text-white h-9 text-sm"
                />
                <Input
                  type="number"
                  min="0"
                  value={lvl.min_referrals ?? ""}
                  onChange={(e) => {
                    const next = [...s.referral_levels]; next[i] = { ...lvl, min_referrals: Number(e.target.value) }; setS({ ...s, referral_levels: next });
                  }}
                  placeholder="Refs"
                  data-testid={`setting-reflvl-${i}-min`}
                  className="col-span-2 bg-[var(--nb-card)] border-[var(--nb-border)] text-white h-9 text-sm tabular"
                />
                <Input
                  type="number"
                  min="0"
                  value={lvl.reward ?? ""}
                  onChange={(e) => {
                    const next = [...s.referral_levels]; next[i] = { ...lvl, reward: Number(e.target.value) }; setS({ ...s, referral_levels: next });
                  }}
                  placeholder="₦ reward"
                  data-testid={`setting-reflvl-${i}-reward`}
                  className="col-span-3 bg-[var(--nb-card)] border-[var(--nb-border)] text-white h-9 text-sm tabular"
                />
                <Input
                  type="color"
                  value={lvl.color || "#F5C518"}
                  onChange={(e) => {
                    const next = [...s.referral_levels]; next[i] = { ...lvl, color: e.target.value }; setS({ ...s, referral_levels: next });
                  }}
                  data-testid={`setting-reflvl-${i}-color`}
                  className="col-span-2 bg-[var(--nb-card)] border-[var(--nb-border)] h-9 p-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = s.referral_levels.filter((_, j) => j !== i); setS({ ...s, referral_levels: next });
                  }}
                  data-testid={`setting-reflvl-${i}-remove`}
                  className="col-span-1 h-9 grid place-items-center text-[var(--nb-muted)] hover:text-red-400"
                  aria-label="Remove level"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const cur = s.referral_levels || [];
                const nextLevel = cur.length ? Math.max(...cur.map((l) => Number(l.level) || 0)) + 1 : 1;
                setS({
                  ...s,
                  referral_levels: [...cur, { level: nextLevel, name: `Level ${nextLevel}`, icon: "gem", color: "#F5C518", min_referrals: 0, reward: 0 }],
                });
              }}
              data-testid="setting-reflvl-add"
              className="w-full rounded-md border border-dashed border-[var(--nb-border)] text-xs text-[var(--nb-muted)] hover:text-white hover:border-[#F5C518] py-2"
            >
              + Add another level
            </button>
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
      )}

      {tab === "payments" && (
      <div className="space-y-5">
        <GatewayTogglesCard />
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
      </div>
      )}

      {tab === "infra" && (
        <>
          <ServerIPCard />
          <WebhookUrlsCard />
        </>
      )}

      {tab === "danger" && <DangerZoneCard />}
    </div>
  );
}
/* -------------------------------------------------------------------------- */
/*  Server IP card — shows the outbound egress IP the payment merchants see.   */
/*  With HTTPS_PROXY configured, this IP is stable forever.                     */
/* -------------------------------------------------------------------------- */

function ServerIPCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/admin/server-ip")
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to fetch server IP"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const copyIp = async () => {
    if (!data?.outbound_ip || data.outbound_ip === "unknown") return;
    try {
      await navigator.clipboard.writeText(data.outbound_ip);
      toast.success(`Copied ${data.outbound_ip}`);
    } catch {
      toast.error("Copy failed — select the text and copy manually");
    }
  };

  return (
    <Card
      className="bg-[var(--nb-card)] border-[var(--nb-border)] p-6 rounded-xl space-y-4"
      data-testid="admin-server-ip-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-600">Server IP for Merchant Whitelists</h2>
          <p className="text-xs text-[var(--nb-muted)] mt-1">
            This is the single IP your payment gateways see. Whitelist it once at PayNow, SHPAY, 1SSPay, and JuntBest dashboards.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={load}
          className="h-8 text-xs border-[var(--nb-border)]"
          data-testid="server-ip-refresh-btn"
        >
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-[var(--nb-muted)]">Checking outbound IP…</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={`px-4 py-3 rounded-xl font-mono font-700 text-2xl tracking-wider flex-1 truncate ${
                data?.static_proxy_configured
                  ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30"
                  : "bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30"
              }`}
              data-testid="server-ip-value"
            >
              {data?.outbound_ip || "unknown"}
            </div>
            <Button
              onClick={copyIp}
              className="h-12 px-4 bg-[var(--nb-card2)] hover:bg-[var(--nb-border)] text-white border border-[var(--nb-border)]"
              data-testid="server-ip-copy-btn"
            >
              Copy
            </Button>
          </div>
          <div className="flex items-start gap-2 text-xs text-[var(--nb-muted)]">
            <div
              className={`px-2 py-0.5 rounded font-display font-700 uppercase tracking-wider text-[10px] shrink-0 ${
                data?.static_proxy_configured
                  ? "bg-[#10B981]/20 text-[#10B981]"
                  : "bg-[#F97316]/20 text-[#F97316]"
              }`}
              data-testid="server-ip-status-badge"
            >
              {data?.static_proxy_configured ? "Static" : "Rotating"}
            </div>
            <div className="leading-relaxed">{data?.instructions}</div>
          </div>
          {data?.static_proxy_configured && data?.proxy && (
            <div className="text-[11px] text-[var(--nb-muted)] pt-2 border-t border-[var(--nb-border)]">
              Routed via: <span className="font-mono">{data.proxy}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Webhook URLs card — one-tap copy of the exact callback URLs each payment  */
/*  gateway needs in its merchant portal. Base URL comes from                  */
/*  window.location.origin so admins get the correct URL for whichever         */
/*  environment they're viewing (preview or production custom domain).         */
/* -------------------------------------------------------------------------- */

const WEBHOOK_GATEWAYS = [
  {
    key: "paynow",
    label: "PayNow · Instant Pay",
    color: "#0055FF",
    portal_field_hint: 'Set in the PayNow dashboard fields labeled "Payin Notify URL" and "Payout Notify URL".',
    urls: [
      { role: "Payin (deposit)",   path: "/api/webhooks/paynow/payin" },
      { role: "Payout (withdraw)", path: "/api/webhooks/paynow/payout" },
    ],
  },
  {
    key: "shpay",
    label: "SHPAY · Quick Pay",
    color: "#8B5CF6",
    portal_field_hint: 'One unified notify URL — SHPAY posts both payin and payout events to it.',
    urls: [
      { role: "Unified (payin + payout)", path: "/api/shpay/webhook" },
    ],
  },
  {
    key: "onesspay",
    label: "1SSPay · Fast Pay",
    color: "#F97316",
    portal_field_hint: 'Set in the 1SSPay merchant dashboard under Callback Settings.',
    urls: [
      { role: "Payin (deposit)",   path: "/api/onesspay/webhook/payin" },
      { role: "Payout (withdraw)", path: "/api/onesspay/webhook/payout" },
    ],
  },
  {
    key: "juntbest",
    label: "JuntPay · Smart Pay",
    color: "#10B981",
    portal_field_hint: 'JuntPay portal → Push address (recommended: single unified URL).',
    urls: [
      { role: "Unified (recommended)", path: "/api/juntbest/webhook", recommended: true },
      { role: "Payin only",            path: "/api/juntbest/webhook/payin" },
      { role: "Payout only",           path: "/api/juntbest/webhook/payout" },
    ],
  },
];

function WebhookUrlsCard() {
  const [origin, setOrigin] = useState("");
  const [copiedPath, setCopiedPath] = useState(null);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const copyUrl = async (path) => {
    const full = `${origin}${path}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopiedPath(path);
      toast.success(`Copied ${full}`);
      setTimeout(() => setCopiedPath(null), 1500);
    } catch {
      toast.error("Copy failed — select the text and copy manually");
    }
  };

  return (
    <Card
      className="bg-[var(--nb-card)] border-[var(--nb-border)] p-6 rounded-xl space-y-4"
      data-testid="admin-webhook-urls-card"
    >
      <div>
        <h2 className="font-display text-lg font-600">Webhook URLs for Merchant Portals</h2>
        <p className="text-xs text-[var(--nb-muted)] mt-1">
          Paste these into each gateway's callback / notify URL field so deposits and payouts auto-approve.
          URLs use this admin panel's origin — <span className="text-white tabular">{origin || "—"}</span>.
        </p>
      </div>

      <div className="space-y-3">
        {WEBHOOK_GATEWAYS.map((g) => (
          <div
            key={g.key}
            className="rounded-xl border border-[var(--nb-border)] bg-[var(--nb-card2)] p-4"
            data-testid={`webhook-group-${g.key}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-9 h-9 rounded-lg grid place-items-center shrink-0"
                style={{ background: `${g.color}20`, color: g.color, border: `1px solid ${g.color}40` }}
              >
                <span className="font-display font-800 text-[10px]">{g.key.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-700 text-white truncate">{g.label}</div>
                <div className="text-[11px] text-[var(--nb-muted)]">{g.portal_field_hint}</div>
              </div>
            </div>

            <div className="space-y-2">
              {g.urls.map((u) => {
                const full = `${origin}${u.path}`;
                const isCopied = copiedPath === u.path;
                return (
                  <div
                    key={u.path}
                    className="rounded-lg border border-[var(--nb-border)] bg-[var(--nb-card)] p-2 flex items-center gap-2"
                    data-testid={`webhook-row-${g.key}-${u.path.split("/").pop()}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-display font-800 tracking-widest text-[var(--nb-muted)]">
                          {u.role}
                        </span>
                        {u.recommended && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-display font-800 uppercase tracking-wider"
                            style={{ background: `${g.color}22`, color: g.color, border: `1px solid ${g.color}55` }}
                          >
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs font-mono text-white truncate select-all" title={full}>
                        {full}
                      </div>
                    </div>
                    <Button
                      onClick={() => copyUrl(u.path)}
                      size="sm"
                      className={`h-9 px-3 shrink-0 text-xs border transition-colors ${
                        isCopied
                          ? "bg-[#10B981]/20 border-[#10B981]/60 text-[#10B981]"
                          : "bg-[var(--nb-card2)] hover:bg-[var(--nb-border)] text-white border-[var(--nb-border)]"
                      }`}
                      data-testid={`webhook-copy-${g.key}-${u.path.split("/").pop()}`}
                    >
                      {isCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[#F5C518]/30 bg-[#F5C518]/8 p-3">
        <div className="text-[11px] text-[var(--nb-muted)] leading-relaxed">
          <span className="text-[#F5C518] font-display font-700">Reminder:</span> also whitelist{" "}
          <span className="text-white font-mono">46.20.101.18</span> as your outbound IP in each merchant portal (see the Server IP card above), then run a{" "}
          <span className="text-white">₦100 test deposit</span> end-to-end. Auto-approved in Admin ⇒ the loop works. Stays Pending ⇒ check the portal's webhook log.
        </div>
      </div>
    </Card>
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

