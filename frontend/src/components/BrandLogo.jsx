import React from "react";

/**
 * Luckycart Box brand mark — a wrapped gift-box (bow + ribbon) with a
 * corner sparkle, set inside a gold gradient tile. Matches the dark-gold
 * "treasure box" aesthetic used across the marketplace.
 *
 * Props:
 *   size  — outer square edge in px (default 32)
 *   glow  — enable the soft gold ambient shadow (default true)
 *   className — extra tailwind classes for the outer tile
 */
export const BrandLogo = ({ size = 32, glow = true, className = "" }) => {
  const iconEdge = Math.round(size * 0.62);
  return (
    <div
      className={`rounded-md grid place-items-center relative overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg,#FFE580 0%,#F5C518 60%,#C99700 100%)",
        boxShadow: glow ? "0 4px 14px rgba(245,197,24,0.45)" : "none",
        color: "#1A1508",
      }}
      data-testid="brand-logo"
      aria-label="Luckycart Box"
    >
      {/* soft radial highlight */}
      <span
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(120% 80% at 20% 15%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 55%)",
        }}
      />
      <svg
        width={iconEdge}
        height={iconEdge}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative"
        aria-hidden="true"
      >
        {/* box top lid */}
        <rect x="3.5" y="8.5" width="17" height="3.5" rx="0.6" />
        {/* box body */}
        <path d="M4.5 12 v8 a1 1 0 0 0 1 1 h13 a1 1 0 0 0 1 -1 v-8" />
        {/* vertical ribbon */}
        <line x1="12" y1="8.5" x2="12" y2="21" />
        {/* left bow loop */}
        <path d="M12 8.5 C 9.5 8.5, 7.5 6.5, 8.8 4.6 C 9.7 3.3, 11.4 4, 12 6" />
        {/* right bow loop */}
        <path d="M12 8.5 C 14.5 8.5, 16.5 6.5, 15.2 4.6 C 14.3 3.3, 12.6 4, 12 6" />
        {/* corner sparkle */}
        <path
          d="M19 3.5 l0.55 1.35 l1.45 0.55 l-1.45 0.55 l-0.55 1.35 l-0.55 -1.35 l-1.45 -0.55 l1.45 -0.55 z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    </div>
  );
};

export default BrandLogo;
