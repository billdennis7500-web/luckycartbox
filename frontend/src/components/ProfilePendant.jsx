/**
 * ProfilePendant — small medallion badge that reflects the user's highest
 * unlocked referral reward level. Designed to be pinned to the bottom-right
 * corner of an avatar (Profile identity card, mobile header) but works
 * standalone too.
 *
 * Props:
 *   tier      — object from /api/referrals/rewards `tiers[]`
 *               { level, name, icon, color } (all optional-safe)
 *   size      — outer edge in px (default 28)
 *   showLabel — when true, renders the level name pill next to the medallion
 *
 * Shows nothing when tier is null/undefined (user hasn't unlocked any level).
 */
import React from "react";
import { Flame, Rocket, Trophy, Crown, Gem, Sparkles } from "lucide-react";

const ICON_MAP = {
  flame: Flame,
  rocket: Rocket,
  trophy: Trophy,
  crown: Crown,
  gem: Gem,
  sparkles: Sparkles,
};

export function TierMedallion({ tier, size = 28 }) {
  if (!tier) return null;
  const Icon = ICON_MAP[tier.icon] || Gem;
  const color = tier.color || "#F5C518";
  const inner = Math.round(size * 0.55);
  return (
    <div
      className="rounded-full grid place-items-center relative overflow-hidden"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg,${color} 0%, ${color}CC 60%, ${color}88 100%)`,
        boxShadow: `0 4px 12px ${color}88, 0 0 0 2px #0B1524`,
        color: "#FFFFFF",
      }}
      data-testid={`pendant-tier-${tier.level}`}
      aria-label={`${tier.name || "Level " + tier.level} pendant`}
    >
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(120% 80% at 22% 18%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%)",
        }}
      />
      <Icon className="relative" style={{ width: inner, height: inner }} strokeWidth={2.4} />
    </div>
  );
}

export function ProfilePendant({ tier, size = 28, showLabel = false }) {
  if (!tier) return null;
  const color = tier.color || "#F5C518";
  return (
    <div className="inline-flex items-center gap-2" data-testid="profile-pendant">
      <TierMedallion tier={tier} size={size} />
      {showLabel && (
        <span
          className="text-[10px] font-display font-800 uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{
            color: color,
            background: `${color}18`,
            border: `1px solid ${color}55`,
          }}
        >
          {tier.name}
        </span>
      )}
    </div>
  );
}

export default ProfilePendant;
