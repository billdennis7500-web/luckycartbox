/**
 * NaijaInvest — 10-tier level system
 *
 * Levels are derived purely from `user.total_invested` (the running total of
 * everything the user has bought through the shop). No admin toggle needed —
 * as soon as their spend crosses the threshold they upgrade automatically.
 *
 * Design goals:
 *  • Feel gamified and aspirational (like a loyalty program).
 *  • Match the shop / warehouse metaphor of the app.
 *  • Progressive colour ramp from grey → bronze → gold → jewel tones →
 *    platinum, so users can see they're climbing.
 *  • Each level gets a short benefit line the user can look forward to.
 *
 * Change thresholds if / when the business team wants a different ladder —
 * this is the ONLY place you'd edit.
 */

export const LEVELS = [
  { key: "l1",  name: "Newcomer",   threshold: 0,        color: "#94A3B8", perk: "Access to Starter products" },
  { key: "l2",  name: "Trader",     threshold: 5_000,    color: "#B87333", perk: "5% referral bonus" },
  { key: "l3",  name: "Retailer",   threshold: 20_000,   color: "#C0C0C0", perk: "Faster withdrawals · <1h" },
  { key: "l4",  name: "Distributor",threshold: 50_000,   color: "#F5C518", perk: "Priority support queue" },
  { key: "l5",  name: "Wholesaler", threshold: 100_000,  color: "#10B981", perk: "+1% daily profit boost" },
  { key: "l6",  name: "Merchant",   threshold: 250_000,  color: "#0055FF", perk: "VIP-only product tier" },
  { key: "l7",  name: "Broker",     threshold: 500_000,  color: "#8B5CF6", perk: "Instant withdrawals" },
  { key: "l8",  name: "Investor",   threshold: 1_000_000,color: "#EF4444", perk: "+2% daily profit boost" },
  { key: "l9",  name: "Tycoon",     threshold: 2_500_000,color: "#EC4899", perk: "Personal account manager" },
  { key: "l10", name: "Mogul",      threshold: 5_000_000,color: "#F59E0B", perk: "Exclusive Mogul products + gifts" },
];

/**
 * Given a total-invested amount, return { current, next, index, progressPct }.
 *  • current  → the highest LEVELS entry the user has already reached.
 *  • next     → the LEVELS entry immediately above them, or null at the cap.
 *  • index    → 0-based index of current (0 = Newcomer, 9 = Mogul).
 *  • progressPct → percentage progress FROM current threshold TO next (0–100).
 *                  Always 100 when there is no next level.
 */
export function deriveLevel(totalInvested = 0) {
  const spent = Number(totalInvested) || 0;
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (spent >= LEVELS[i].threshold) idx = i;
    else break;
  }
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  let progressPct = 100;
  if (next) {
    const span = next.threshold - current.threshold;
    const gained = spent - current.threshold;
    progressPct = Math.max(0, Math.min(100, (gained / span) * 100));
  }
  return { current, next, index: idx, progressPct };
}
