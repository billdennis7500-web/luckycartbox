/*  Shared visual language for NaijaInvest — matches the Marketplace redesign
 *  (dark-gold ambient background, tier-colored glow border, dashed gold accent
 *  lines, purple pill CTAs, chip badges, big monospaced numbers).
 *
 *  Every page imports the primitives from here so the aesthetic stays 100%
 *  consistent and future style tweaks land in one place.
 */
import React from "react";
import { Card } from "./ui/card";
import { ChevronRight } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Tier / accent color tokens                                                 */
/* -------------------------------------------------------------------------- */
export const TIER_TOKENS = {
  legendary: { chipBg: "#F5C518", chipFg: "#1A1508", glow: "#F5C518" },
  epic:      { chipBg: "#A855F7", chipFg: "#FFFFFF", glow: "#A855F7" },
  hot:       { chipBg: "#EF4444", chipFg: "#FFFFFF", glow: "#EF4444" },
  newcomer:  { chipBg: "#10B981", chipFg: "#FFFFFF", glow: "#10B981" },
  tech:      { chipBg: "#0055FF", chipFg: "#FFFFFF", glow: "#0055FF" },
  fashion:   { chipBg: "#EC4899", chipFg: "#FFFFFF", glow: "#EC4899" },
  gold:      { chipBg: "#F5C518", chipFg: "#1A1508", glow: "#F5C518" },
  purple:    { chipBg: "#7C3AED", chipFg: "#FFFFFF", glow: "#7C3AED" },
  success:   { chipBg: "#10B981", chipFg: "#FFFFFF", glow: "#10B981" },
  danger:    { chipBg: "#EF4444", chipFg: "#FFFFFF", glow: "#EF4444" },
  info:      { chipBg: "#0055FF", chipFg: "#FFFFFF", glow: "#0055FF" },
};

/* -------------------------------------------------------------------------- */
/*  <SectionHeader> — the yellow bar + heading + subtitle pattern              */
/* -------------------------------------------------------------------------- */
export function SectionHeader({ title, subtitle, right, testid, tone = "gold" }) {
  const t = TIER_TOKENS[tone] || TIER_TOKENS.gold;
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 rounded-sm" style={{ background: t.glow }} />
          <h1
            className="font-display text-2xl font-800 tracking-tight text-white truncate"
            data-testid={testid}
          >
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="text-sm text-[var(--nb-muted)] mt-1 ml-3">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  <AmbientCard> — the flagship card style: dark-gold gradient background     */
/*  with a tier-colored ambient glow + dashed accent lines top/bottom.         */
/*  Used for hero cards, big-number displays, feature blocks.                  */
/* -------------------------------------------------------------------------- */
export function AmbientCard({
  children,
  tone = "gold",
  className = "",
  padded = true,
  glow = true,
  dashed = true,
  testid,
  onClick,
  as: Tag = "div",
}) {
  const t = TIER_TOKENS[tone] || TIER_TOKENS.gold;
  return (
    <Tag
      onClick={onClick}
      data-testid={testid}
      className={`relative rounded-2xl overflow-hidden ${onClick ? "card-hover cursor-pointer" : ""} ${className}`}
      style={
        glow
          ? { boxShadow: `0 6px 32px -8px ${t.glow}55, 0 0 0 1px ${t.glow}20` }
          : {}
      }
    >
      {dashed && (
        <>
          <div
            className="absolute inset-x-0 top-0 h-[2px] pointer-events-none z-10"
            style={{
              background: `repeating-linear-gradient(90deg, ${t.glow} 0 8px, transparent 8px 14px)`,
              opacity: 0.55,
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[2px] pointer-events-none z-10"
            style={{
              background: `repeating-linear-gradient(90deg, ${t.glow} 0 8px, transparent 8px 14px)`,
              opacity: 0.55,
            }}
          />
        </>
      )}
      <Card
        className={`relative border-0 rounded-2xl bg-[var(--nb-card)] ${padded ? "p-5" : ""}`}
        style={{ background: "linear-gradient(135deg,#1E1B0A 0%,#231F0F 45%,#0B0906 100%)" }}
      >
        {children}
      </Card>
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/*  <SoftCard> — a lighter variant when you want the aesthetic but not the    */
/*  full dark-gold treatment (e.g. secondary sections, list rows).             */
/* -------------------------------------------------------------------------- */
export function SoftCard({ children, className = "", padded = true, testid, onClick }) {
  return (
    <Card
      onClick={onClick}
      data-testid={testid}
      className={`relative bg-[var(--nb-card)] border border-[var(--nb-border)] rounded-2xl ${padded ? "p-4" : ""} ${
        onClick ? "card-hover cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  <TierBadge> — corner chip with icon + label                                */
/* -------------------------------------------------------------------------- */
export function TierBadge({ label, tone = "gold", icon: Icon, className = "", testid }) {
  const t = TIER_TOKENS[tone] || TIER_TOKENS.gold;
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-display font-700 uppercase tracking-wider text-[10px] shadow ${className}`}
      style={{ background: t.chipBg, color: t.chipFg }}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  <StatChip> — inline stat with icon + label + big number                    */
/* -------------------------------------------------------------------------- */
export function StatChip({ icon: Icon, label, value, tone = "gold", testid }) {
  const t = TIER_TOKENS[tone] || TIER_TOKENS.gold;
  return (
    <div
      data-testid={testid}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-display font-700"
      style={{ background: `${t.glow}18`, color: t.glow, border: `1px solid ${t.glow}40` }}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label && <span className="uppercase tracking-wider text-[10px] opacity-80">{label}</span>}
      <span className="tabular">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  <BigStat> — the giant tabular number w/ tiny uppercase label above         */
/* -------------------------------------------------------------------------- */
export function BigStat({ label, value, tone, prefix = "", suffix = "", testid, className = "" }) {
  const t = tone ? TIER_TOKENS[tone] : null;
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--nb-muted)]">
        {label}
      </div>
      <div
        data-testid={testid}
        className="mt-1 font-display font-800 text-3xl tabular text-white tracking-tight"
        style={t ? { color: t.glow } : {}}
      >
        {prefix}
        {value}
        {suffix && <span className="text-lg opacity-70 ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  <PillCTA> — the signature purple pill-shaped call-to-action                */
/* -------------------------------------------------------------------------- */
export function PillCTA({
  children,
  onClick,
  disabled,
  tone = "purple",
  size = "md",
  className = "",
  icon: Icon,
  showArrow = true,
  type = "button",
  testid,
}) {
  const t = TIER_TOKENS[tone] || TIER_TOKENS.purple;
  const sizeCls = size === "sm" ? "h-9 px-4 text-sm" : size === "lg" ? "h-12 px-6 text-base" : "h-10 px-5 text-sm";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className={`inline-flex items-center justify-center gap-1 rounded-full font-display font-700 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] ${sizeCls} ${className}`}
      style={{
        background: t.chipBg,
        color: t.chipFg,
        boxShadow: `0 8px 24px -8px ${t.glow}80`,
      }}
    >
      {Icon && <Icon className="w-4 h-4 mr-0.5" />}
      <span>{children}</span>
      {showArrow && <ChevronRight className="w-4 h-4 ml-0.5" />}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  <MicroLabel> — tiny uppercase tracked label used above every stat          */
/* -------------------------------------------------------------------------- */
export function MicroLabel({ children, className = "", tone }) {
  const t = tone ? TIER_TOKENS[tone] : null;
  return (
    <div
      className={`text-[10px] uppercase tracking-widest text-[var(--nb-muted)] ${className}`}
      style={t ? { color: t.glow, opacity: 0.85 } : {}}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  <StackChip> — long chip with divider (used in "Total return ₦X" style)     */
/* -------------------------------------------------------------------------- */
export function StackChip({ label, value, tone = "gold", testid }) {
  const t = TIER_TOKENS[tone] || TIER_TOKENS.gold;
  return (
    <div
      data-testid={testid}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md"
      style={{
        background: `${t.glow}12`,
        border: `1px solid ${t.glow}35`,
      }}
    >
      {label && (
        <>
          <span className="text-[10px] uppercase tracking-wider opacity-70" style={{ color: t.glow }}>
            {label}
          </span>
          <span className="w-px h-3 opacity-30" style={{ background: t.glow }} />
        </>
      )}
      <span className="font-display font-700 tabular text-sm" style={{ color: t.glow }}>
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  <RowItem> — reusable list row (Transactions / History / Referrals share)  */
/* -------------------------------------------------------------------------- */
export function RowItem({ icon: Icon, tone = "info", title, subtitle, amount, sub, right, testid, onClick }) {
  const t = TIER_TOKENS[tone] || TIER_TOKENS.info;
  return (
    <div
      onClick={onClick}
      data-testid={testid}
      className={`flex items-center gap-3 p-3 rounded-xl bg-[var(--nb-card)] border border-[var(--nb-border)] ${
        onClick ? "card-hover cursor-pointer" : ""
      }`}
    >
      <div
        className="w-10 h-10 shrink-0 rounded-lg grid place-items-center"
        style={{ background: `${t.glow}18`, border: `1px solid ${t.glow}40`, color: t.glow }}
      >
        {Icon && <Icon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-700 text-sm text-white truncate">{title}</div>
        {subtitle && <div className="text-[11px] text-[var(--nb-muted)] truncate">{subtitle}</div>}
      </div>
      {right ?? (
        <div className="text-right shrink-0">
          {amount && (
            <div className="font-display font-800 tabular text-sm" style={{ color: t.glow }}>
              {amount}
            </div>
          )}
          {sub && <div className="text-[10px] text-[var(--nb-muted)]">{sub}</div>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  <EmptyState> — cohesive empty state with a treasure-chest icon              */
/* -------------------------------------------------------------------------- */
export function EmptyState({ icon: Icon, title, subtitle, action, testid }) {
  return (
    <AmbientCard tone="gold" className="text-center" padded testid={testid}>
      <div className="py-4">
        {Icon && (
          <div
            className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-3"
            style={{
              background: "linear-gradient(135deg,#FFE580,#F5C518)",
              boxShadow: "0 4px 20px rgba(245,197,24,0.35)",
            }}
          >
            <Icon className="w-6 h-6 text-[#1A1508]" />
          </div>
        )}
        <div className="font-display font-800 text-lg text-white">{title}</div>
        {subtitle && <div className="text-sm text-[var(--nb-muted)] mt-1">{subtitle}</div>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </AmbientCard>
  );
}
