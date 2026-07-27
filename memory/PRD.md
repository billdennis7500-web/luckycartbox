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

## 2026-02-01 · PayNow integration + server-side cron

### Delivered
- PayNow SDK (`backend/paynow.py`): sign-payload / verify-callback per MD5 spec (`merchantNo + sortedJSON + signType + timestamp + key`).
- Auto deposits: user chooses "PayNow (instant)" → backend calls `/open/v1/payins/create` → returns checkout URL → user pays → PayNow POSTs to `/api/webhooks/paynow/payin` → wallet auto-credited (verified: ₦0 → ₦500).
- Auto payouts: admin approve on a withdrawal that carries `bank_code` triggers `/open/v2/payouts/create`. Callback at `/api/webhooks/paynow/payout` marks approved or refunds the held funds.
- Admin overview shows LIVE badge + real gateway balance (queried from `/open/v1/merchant/balance`).
- User withdrawal form: searchable Nigerian bank list fetched from PayNow.
- Admin settings exposes the two callback URLs (copy-to-clipboard) for merchant-dashboard configuration.
- Server-side cron: `_profit_drop_cron` runs every 15 min against all users with active investments (in addition to lazy-on-read).

### Verified live
- `GET /admin/paynow/balance` → `{code:0, data:{amount:"0", currencyCode:"NGN"}}`
- `GET /admin/paynow/banks` → returned full NG bank list
- `POST /deposits` with `paynow-auto` → real order created at PayNow with checkout URL
- Simulated PayNow callback with correct MD5 sign → deposit approved, user wallet credited, response body = `"SUCCESS"`

### Configuration required by user
1. Log into `https://merchant.paynow.money` and set the two webhook URLs shown in admin/settings.
2. Whitelist our server's egress IP in PayNow dashboard for payout, statement and balance endpoints.

### Deferred
- SMS OTP for phone verification (needs provider selection — Termii recommended).
- Automatic reconciliation cron that queries `/open/v3/payins/query` for stuck-pending deposits older than 30 min.

## 2026-07-27 · Multi-account deposit + admin view-as-user + Portfolio polish

### Delivered
- **Landing page removed** — root `/` now routes: anonymous → `/login`, user → `/dashboard`, admin → `/admin` (via a new `RootRedirect` component reading `useAuth`). `pages/Landing.jsx` deleted.
- **Admin can "view as user"**: `/admin/users` list simplified (search + Investors ratio + row → `/admin/users/<id>`). `/admin/users/<id>` renders a mirrored dashboard — user header, wallet card with **Credit/Debit toggle** (green/red submit), stat chips, bound bank, investments and transactions tables. Debit uses the same `POST /admin/users/{uid}/add-balance` endpoint with a **negative amount** (transaction type auto-switches to `admin_debit`) and an **overdraft guard** that returns 400 with a friendly `Cannot debit ₦X — user only has ₦Y` message.
- **Admin Deposits richer** — summary strip (Pending value, Approved value, Row count), method dropdown (All/PayNow/Manual), search box, PayNow/Manual chip in the Method column with bank+account-number sub-line for manual deposits, and an **expandable detail row** showing Deposit ID, Gateway, Method (raw), Reference, Merchant order + PayNow order (copy buttons) + Open checkout link, or Bank/Account#/Account name for manual.
- **User Deposit modern multi-account** — dedicated PayNow tile at top ("Instant · Recommended"), then a grid of active payment-account cards (brand-tinted avatar, bank name, account name, big tabular account number, per-card copy button, radio selection). Admin can toggle each account's visibility with the existing `active` flag on `/admin/accounts`. Deposit docs now persist `payment_account_bank/number/name` when a manual account is chosen, so the admin table can render meaningful method info.
- **Portfolio redesign** — hero portfolio-value card (glass gradient, active-capital + earned-so-far + projected-remaining chips) followed by per-plan cards with a **brand-tinted gradient header**, **circular Ring SVG progress**, 2-col Earned+ROI / Remaining+days-left grid, next-payout **countdown** ("Nh Mm"), and a gradient-tinted progress bar.
- Clipboard copy handlers hardened everywhere (try/catch → error toast on permission-denied instead of a false-positive "Copied").
- **59/59 pytest passing** (9 new tests: `TestAdminGetUserRegression`, `TestAdminAddBalanceDebit`, `TestDepositEnrichment`).

### Bug fixed
- `/api/admin/users/<uid>` used to 500 on any user with investments due to `{**d, "id": str(d.pop("_id")), ...}` unpacking `_id` (ObjectId) into the result before it was popped. Rewrote to use `clean()` + explicit FK stringification for `user_id` / `product_id`.

### Deferred (unchanged)
- `server.py` router split (1552 lines now — router files already exist under `/backend/routers/*` but still unmounted).
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff.
- Auto-reconciliation cron for stuck deposits >30 min.

## 2026-07-27 · Withdrawal UX split + Portfolio nav tab

### Delivered
- **Dedicated Bind Bank Account page** (`/bank-account`): bank picker drawer (32 curated + 485 total), 9–12 digit account number input, account name input, silent non-blocking PayNow eligibility check with a **neutral blue "We couldn't auto-check" banner** replacing the old scary "PayNow could not verify" failure copy.
- **Withdraw page simplified** (`/withdraw`): shows a bound-account card with "Change" link (or a CTA card if not bound), a single amount input, and a submit button. No more inline bank picker.
- **New /investments page** ("Portfolio" tab) — active/completed/all tabs, active-capital & total-earned summary chips, per-plan progress bars.
- **Bottom nav expanded to 5 items** (Home, Invest, Portfolio, Referrals, Profile). "Active investments" section removed from Home/Dashboard.
- Backend: new `GET / POST / DELETE /api/me/bank-account` (with 9–12 digit validation, brand persistence). `POST /api/withdrawals` now accepts `{amount}` only, resolving bank fields from the bound account. Backwards-compatible with explicit bank fields.
- 50/50 pytest passing (10 new tests for `/me/bank-account` + amount-only withdrawal).

### Deferred (unchanged)
- `server.py` router split (1527 lines now — router files exist under `/backend/routers/*` but not yet mounted).
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff hardening.
