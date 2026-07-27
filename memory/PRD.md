# NaijaInvest — Nigerian Online Investment Platform

## Original problem statement
Build a Nigerian online investment website with an admin backend and user frontend.
- Admin controls: products/plans, deposits & withdrawals approval, 3-generation referral rates, coupon codes, welcome bonus, multiple payment (bank) accounts, per-user balance adjustments.
- Users: sign up (phone + password), receive ₦500 welcome bonus, deposit, invest, earn 24h daily profit drops, refer across 3 generations (default 20/5/2%), redeem coupons (only after investing), withdraw to bank (only after investing).
- Blue primary color, professional look. Payment gateway API to be provided later — for now mock manual deposits/withdrawals with admin approval.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB), JWT (httpOnly cookies + Bearer fallback), bcrypt hashing, `/api` prefix.
- **Frontend**: React 19 + React Router 7 + Shadcn UI + Tailwind (custom dark blue theme, Outfit + IBM Plex Sans typography), Sonner toasts.
- **Auth**: phone number (Nigerian, auto-normalized to +234…) + password. Admin seeded on startup from `.env`.
- **Referrals**: `referred_by` chain; on invest, walk 3 hops upline and pay configurable %.
- **Profit drops**: lazy on read (`/auth/me`, `/investments`) — computes full-day cycles elapsed and credits missing days in one shot.

## Personas
- **Investor** — signs up with a phone number, deposits, picks a plan, watches daily profit.
- **Referrer** — shares link/code, earns commissions across 3 generations.
- **Admin** — configures plans, approves cash flow, controls settings and user balances.

## Core requirements (static)
- 3-generation referral tree with admin-configurable percentages (default 20/5/2).
- Welcome bonus (default ₦500) on registration.
- Withdrawal gated by first investment.
- Coupon redemption gated by first investment.
- Multiple admin-managed payment accounts for deposits.
- Admin can credit any user's wallet.
- Daily profit drop for the plan's `duration_days`.

## What's implemented (2026-02-01)
- ✅ Full auth (register, login, logout, `/me`, admin seeding, brute-force safe compare).
- ✅ Product CRUD + 3 seeded default plans (Starter / Silver / Gold).
- ✅ Invest with wallet debit + referral commission distribution (3 gens).
- ✅ Deposits (user request, admin approve/reject with wallet credit).
- ✅ Withdrawals (hold on request, refund on reject, credit user on approve).
- ✅ Coupon CRUD + redemption (gated by invest, single-use per user).
- ✅ Referrals page (code, share link, per-gen totals + users).
- ✅ Payment accounts CRUD (visible list filtered by `active`).
- ✅ Admin dashboard with stats + quick actions.
- ✅ Admin user list, search, drill-in, add balance.
- ✅ Settings (welcome bonus, min deposit/withdrawal, site name, referral %).
- ✅ Daily profit drop (lazy, on read).
- ✅ 21/21 pytest backend tests passing.

## Backlog / next iterations
- **P0** Wire real deposit/payout API when user provides it (replace manual admin approval).
- **P1** Server-side cron for profit drops (currently lazy on read), transactional email/SMS OTP for phone verification, password reset via SMS.
- **P1** Investment maturity notification, referral leaderboard.
- **P2** Charts on dashboard (recharts) for wallet history, animated counters, KYC document uploads.
- **P2** Admin bulk actions, CSV export of transactions/withdrawals, two-factor auth for admin.

## Credentials
See `/app/memory/test_credentials.md`.
- Admin: `+2348000000000` / `Admin@12345`

## Ports & env
- Backend on 8001 (`/api` prefix). Frontend on 3000. Both supervised.
- `backend/.env` holds `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_PHONE`, `ADMIN_PASSWORD`, `FRONTEND_URL`.
- `frontend/.env` holds `REACT_APP_BACKEND_URL`.
