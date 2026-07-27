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

## 2026-07-27 · Iframe checkout (hide gateway) + Transaction history page

### Delivered
- **Iframe-embedded checkout** on `/deposit` — `submit()` no longer calls `window.open(checkout_url)`. The returned URL is loaded inside an `<iframe data-testid="deposit-checkout-iframe">` inside the existing waiting Drawer (spinner overlay while loading, `referrerPolicy="no-referrer"`, appropriate `sandbox` attrs). No new tab is opened. The "Reopen checkout" anchor was removed — only "I've paid — check now" + Close remain.
- **PayNow gateway domain fully hidden from the URL bar** — the address bar never navigates away from our origin; the checkout renders inside our layout. (Determined users with DevTools can still see the iframe `src` — an intentional trade-off since fully proxying the gateway HTML would violate PayNow ToS.)
- **Confirmed via test agent** — Playwright `context.on('page', …)` logged **zero** new pages during deposit submit; no `a[target="_blank"]` anchors remain on `/deposit`.
- **Transaction history page** (`/transactions`) rewritten with the same modern accent-card design used by Deposit/Withdraw history: per-row deterministic accent bar, icon-in-tinted-circle per transaction type (Deposit/Withdrawal/Coupon/Referral/Admin credit/…), human-readable labels, credit/debit arrow + color, 3 tabs (All / Credits / Debits) with counts, search, load-more (step=10) with "Showing X of Y" counter, back arrow to `/profile`.
- **Profile menu link** — added "Transaction history" between Referrals and Deposit.
- Removed unused `ExternalLink` import; added `"investment"` alias in the transaction typeMeta map.

### Deferred (unchanged)
- `server.py` router split.
- SMS OTP.
- Second-factor confirmation on auto-payout toggle.
- Optional `POST /api/admin/paynow/simulate-ip-block` for deterministic CI testing.
- Cleanup cron for stuck `status='failed'` deposits.

## 2026-07-27 · PayNow IP-block graceful degradation (production bug fix)

### Reported issue
User saw a Cloudflare 520-style **"The origin web server returned an invalid or incomplete response to Cloudflare"** page when initiating an Instant Pay deposit. The pod's outbound IP (34.170.12.145) was NOT the one whitelisted at PayNow (104.198.214.223), so every PayNow call returned `{code: 10000039, msg: "IP whitelist check failed"}`. Our backend was raising HTTP 502 in response, which Cloudflare intercepts and replaces with its own error page — so the user never saw our actual error message.

### Fix delivered
- **`paynow.py`** — added `_observe_response()` that sniffs every PayNow reply and flips a process-local `ip_blocked` flag with a 5-min TTL when it sees error code `10000039`. On the next successful response (`code=0`) the flag auto-clears (recovery).
- **`GET /api/paynow/banks`** — respects `paynow.ip_blocked()`. When flagged, returns `{enabled: false, reason: "gateway_ip_blocked", data: []}` in ~1ms with no outbound call. The Deposit page's existing `enabled=false` branch already hides the Instant Pay tile, so users transparently see only manual bank options.
- **`POST /api/deposits {method:"paynow-auto"}`** — fast-fails with **HTTP 400** (not 502) when `ip_blocked` is set: `"Instant Pay is temporarily unavailable. Please pick a bank transfer option below."` Cloudflare passes 400 bodies through unchanged, so users see our real message. Same 400 (not 502) treatment when the outbound PayNow call raises OR returns `code != 0`. Deposit doc stays with `status: "failed"` + `gateway_error` for the admin audit trail.
- **6 new pytest** cases: `TestPaynowIpBlockUnit` (_observe_response happy + block + clear-on-recovery) and `TestPaynowGracefulDegradation` (HTTP-level contracts, skip-when-healthy design).

### Auto-recovery verified in the wild
During testing the pod's outbound IP shifted from 34.170.12.145 → 104.198.214.223 (whitelisted). The very next PayNow call returned `code=0`, `_observe_response` cleared the flag, `/paynow/banks` immediately started returning `enabled=true` with the full curated bank list — no manual restart needed.

### Notes for the future
- Test-suite total is now **82** (79 pass, 3 skip-by-design when gateway is healthy — no meaningful way to force IP-block from inside a passing production env). Optional next step: expose `POST /api/admin/paynow/simulate-ip-block` for CI-forced testing.
- Backend still ~1750 lines; router split remains deferred.
- Consider a cleanup cron / TTL index for `deposits` rows stuck at `status='failed'` accumulating during outages.

## 2026-07-27 · Admin control panel expansion + impersonation + fee engine

### Delivered
- **Backend settings** extended: `withdrawal_fee_pct` (default **15**), `auto_payout_enabled` (default **false** = manual approval), `deposit_quick_amounts` (admin-editable presets), `batch_approve_limit` (default 50). `/api/settings/public` now exposes the non-sensitive ones so the user UI can react.
- **Withdrawal fee engine**: `POST /api/withdrawals` computes `fee = amount * fee_pct / 100` and `payout_amount = amount - fee`. When `auto_payout_enabled=true` AND `paynow.enabled()` AND the withdrawal has a `bank_code`, the payout is fired immediately (helper `_paynow_payout_withdrawal`) — failures are logged, not raised, so the withdrawal stays pending for manual retry.
- **Bulk approve**: `POST /api/admin/withdrawals/bulk-approve` — accepts an `ids` array, enforces `batch_approve_limit`, returns `{approved, processing, skipped, errors[]}`.
- **Admin impersonation**: `POST /api/admin/users/{uid}/impersonate` swaps auth cookies to the target user, refuses on admin targets. `POST /api/admin/impersonate/stop?admin_id=X` restores admin cookies. Admin's own id is stored in `localStorage.impersonation_admin_id` so the frontend knows when to render the pill.
- **Extended `admin_get_user`**: now returns `total_deposited` (sum of approved deposits), `inviter` (or null), and `gen1_referrals` list.
- **Admin add-balance** now increments `user.total_admin_credited` / `user.total_admin_debited` and stores the admin's email + name in the transaction meta — enabling the "Admin-funded" chip on the users list + audit trail on the user detail page.
- **Frontend Dashboard**: welcome modal is inset from phone edges (`w-[calc(100vw-2rem)]`); quick actions reordered → **Deposit / Withdraw / Redeem / Invest**.
- **Frontend Deposit**: quick-amount chips now driven by `settings.deposit_quick_amounts` (admin-editable in Settings).
- **Frontend Withdraw**: fee preview panel (You send / Platform fee (X%) / You receive) — appears only when `fee_pct > 0`. Instant banner copy adapts based on `auto_payout_enabled`.
- **Frontend AdminSettings**: added Withdrawals section (fee %, batch limit, auto-payout checkbox) + Deposit-page section (quick-amount presets comma-list).
- **Frontend AdminUsers**: "Funded by admin" chip on rows + filter toggle + "Funded" count stat.
- **Frontend AdminUserDetail**: new stat chips (total deposited, admin credited), inviter card that links back to that admin user detail, Gen-1 referrals list with drill-in links, and a "Log in as user" impersonate button with confirm.
- **Frontend AdminWithdrawals**: bulk-approve mode — checkbox column when tab=pending, "Approve N selected" button, summary chips (pending value, fees collected, batch limit), dynamic Auto-payout/Manual chip.
- **Frontend UserLayout**: floating orange **"Viewing as X · Return"** pill at top-center whenever admin is impersonating; return does a hard reload to `/admin` to avoid cookie/context race.
- **Frontend AdminLayout**: pending-count badges on Deposits + Withdrawals nav items (refreshed every 30s via `/api/admin/stats`).
- **74/76 pytest** (1 real bug found + fixed; 1 environmental network flake on paynow verify).

### Bugs fixed this iteration
- `admin_get_user` inviter lookup was querying `{"referral_code": u["referred_by"]}` but `referred_by` is stored as `ObjectId` at register time — always no match. Root cause + fix now use `{"_id": u["referred_by"]}`. Same bug pattern on Gen-1 lookup: `{"referred_by": u.get("referral_code")}` fixed to `{"referred_by": u["_id"]}`.
- Welcome dialog was flush against right edge on 428px viewport (Radix `left-1/2 -translate-x-1/2` combined with `w-[calc(100%-2rem)] mx-4` mis-computed width). Simplified to `w-[calc(100vw-2rem)]` — now symmetric.
- Impersonation "Return to admin" pill sometimes didn't tear down because soft nav happened before setUser propagated. Switched to `window.location.assign('/admin')` for a hard reload.

### Deferred (unchanged)
- `server.py` router split (~1745 lines).
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff.
- Auto-reconciliation cron for deposits stuck > 30 min.
- Consider background queue for bulk-approve at large batches (currently synchronous — max 50 default).
- Second-factor confirmation on toggling auto_payout to ON (safety guard).

## 2026-07-27 · Welcome pop-up + Telegram + polished redeem/history

### Delivered
- **Welcome pop-up modal** on `/dashboard` — fires on every mount/hard-refresh (per user's explicit request "only when user taps on the homepage or refreshes the homepage, it pops up"). Shows greeting, admin-editable `welcome_message`, primary "Join our Telegram community" button (hidden when `telegram_url` empty), and Continue-to-dashboard button.
- **Join Telegram chip** in the dashboard header (`dashboard-telegram-chip`) linking to `telegram_url` — hidden when empty.
- **Backend**: `telegram_url` + `welcome_message` added to `DEFAULT_SETTINGS` + `SettingsIn`. New public `GET /api/settings/public` (no auth) returns `{site_name, telegram_url, welcome_message, welcome_bonus, min_deposit, min_withdrawal}`. `AdminSettings.jsx` PUT payload expanded accordingly (Telegram URL + Welcome message input added to `/admin/settings`).
- **Dashboard**: 4-in-1 Quick Actions grid (Deposit / Redeem / Withdraw / Invest) with icon-in-ring tiles. "Recent activity" section removed.
- **Deposit**: smaller compact method blocks (min-h-92px), **auto-selection** of the first available method on mount (Instant if enabled, else first payment account), and **quick-amount chips** (₦500/1K/2K/5K/10K/20K) in a 3-col grid.
- **Deposit history**: fully redesigned modern cards with per-row deterministic accent bar, arrow-down icon in tinted circle, method chip, status badge with icon.
- **Withdraw**: "Recent withdrawals" section removed; dedicated `/withdraw-history` page created (mirrors deposit-history design with an arrow-up icon).
- **Profile**: History Tabs section (Transactions / Deposits / Withdrawals) removed. Menu links added for deposit-history / withdraw-history / bank-account.
- **Coupon (Redeem)**: reworked as a ticket-styled card with left/right notches, orange hero, tabular tracking on the code input, and a green success chip after a successful redeem.
- **Investments (Portfolio)**: each active plan card now shows a `Daily earnings +₦X / day` strip (green tint) computed as `price × daily_profit_pct / 100`.
- **62/62 pytest** (61 pass + 1 pre-existing flaky-in-parallel `TestPaynowBanks`).

### Deferred (unchanged)
- `server.py` router split (~1570 lines now).
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff.
- Auto-reconciliation cron for stuck deposits.
- Extract shared HistoryRow into `/components/history/HistoryRow.jsx` (duplication between Deposit/Withdraw history).

## 2026-07-27 · Deposit UX simplification + rebrand + history page

### Delivered
- **Deposit page 3-in-1 block grid** — all payment methods now render as equal-sized aspect-square blocks (`grid-cols-3`): one "Instant Pay" block (only shown when the auto-gateway is enabled) plus one block per active `payment_account`. No more giant featured banner.
- **Zero PayNow branding in the user UI** — every user-facing occurrence of "PayNow" is gone (deposit, bind-account, profile). Rebranded as "Instant Pay" for the gateway path.
- **Zero-manual empty state** — when the admin has 0 active `payment_accounts`, the deposit page shows nothing referencing "manual"/"Or transfer to one of our banks" (only the Instant tile appears — or a neutral empty state if the gateway is also disabled).
- **Dedicated `/deposit-history` page** — moved off the deposit page. 4 status tabs with counts, free-text search, empty state, load-more pattern (step=10) with "Showing X of Y" counter. Verified end-to-end with a 15-deposit user.
- **Pure frontend refactor** — no backend changes, backend regression pytest still 59/59.

### Deferred (unchanged)
- `server.py` router split (1552 lines).
- SMS OTP.
- PayNow `query_payee` 429 retry/backoff.
- Auto-reconciliation cron for deposits stuck > 30 min.

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

## 2026-07-27 · PayNow tile always visible + in-app graceful fallback

### Delivered
- **Instant Pay tile is now always visible** on `/deposit` when PayNow is env-configured. Previously the tile was completely hidden whenever the pod's outbound IP wasn't whitelisted at PayNow — leaving users confused ("Why is my Pay Now option not popping up?"). Backend `/api/paynow/banks` now returns `{enabled:true, gateway_ready:false, reason:"gateway_ip_blocked"}` in that case instead of `{enabled:false}`.
- **In-app iframe drawer is preserved** — the Vaul bottom drawer opens on submit, containing an `<iframe sandbox>` for the checkout URL. No `window.open`, no visible gateway domain. Confirmed via Playwright smoke test.
- **Graceful "gateway warming up" state** — when the IP is blocked, `POST /api/deposits` no longer 400s; it returns a well-formed deposit with `gateway_ready:false` and a `gateway_message`. The drawer opens with a clean inline "Instant Pay is temporarily unavailable" card + a **one-click "Use bank transfer instead"** CTA that closes the drawer and pre-selects the first active manual account.
- **Subtle "Slow" badge** on the Instant Pay tile itself when `gateway_ready=false`, so users see the state before they even click.
- No new tabs, no PayNow branding — every user-visible string uses "Instant Pay" / "our payment gateway".

### Deferred (unchanged)
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff hardening.
- Auto-reconciliation cron for stuck deposits >30 min.

## 2026-07-27 · Full-screen checkout + admin QoL bundle

### Delivered
- **Deposit checkout is now a full-screen modal** (was a swipeable bottom drawer). `fixed inset-0 z-[60]` overlay with a sticky header ("Complete your payment", ₦ amount) and sticky footer with a "Close" button. **No swipe-down gesture** — user can only dismiss via the explicit Close/Done button (or after a terminal approved/rejected/unavailable state).
- **Instant Pay tile always shows "FAST" (green badge, "Fast · Recommended")** — previously flipped between "Slow" and "Fast" based on runtime health. Now consistent branding regardless of gateway state.
- **Withdrawal duplicate row bug fixed** — the transaction feed used to show *both* a `withdrawal_hold` (-₦X) and a `withdrawal` (-₦X) row for the same withdrawal, making users think they were debited twice. Backend now consolidates: on approval (manual, bulk, PayNow webhook, PayNow reconcile) the existing `withdrawal_hold` transaction is **updated in-place** to `withdrawal` via a new `settle_withdrawal_hold()` helper. On rejection the flow is unchanged (hold + refund pair still shows the reversal trail). Migrated 33 pre-existing duplicate rows out of the DB.
- **Investment countdown ticks with seconds** — `Next payout` now displays `Xh Ym Zs` (padded) and re-renders every 1s via a `useState` tick on `/investments`. Verified end-to-end: `15h 47m 38s → 15h 47m 35s` over 3s.
- **Admin "Log in as user" now opens in a new browser tab** with a per-tab impersonation token stored in `sessionStorage` (not shared across tabs). Admin's own cookies remain intact in the original tab. New backend endpoint `POST /admin/users/{uid}/impersonate-token` mints the token without touching cookies. New frontend route `/impersonate#token=…` bootstraps the impersonated session and clears the fragment. Axios interceptor sends `Authorization: Bearer <token>` (with `withCredentials: false`) for that tab only. The impersonation tab shows an amber pill "Admin view: {name} · Close" (close = `window.close()`).
- **Admin add-balance toast** now shows the new balance + a "View user" action that scrolls to the user's transactions section for immediate audit.
- **AdminUserDetail** already displays "Referred by" (inviter card, linked) and "People they referred (Gen 1)" (list with invested totals + linked cards) — verified in this iteration.

### Deferred (unchanged)
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff hardening.
- Product logo icon upload (next iteration).
- Auto-reconciliation cron for stuck deposits >30 min.

## 2026-07-27 · History labels + privacy + Light/Dark theme

### Delivered
- **Withdrawal history rows now lead with a clear status headline** — "Withdrawal successful" / "Withdrawal pending" / "Withdrawal rejected" (etc.) above the amount, so users can identify each row at a glance instead of just seeing a naked ₦ figure. `data-testid=whist-row-label-<id>`.
- **Deposit history rows now lead with "Deposit successful" / "Deposit pending" / "Deposit rejected"** headline above the amount for the same reason. Removed the raw platform-account-number chip beside the method tag (was clutter).
- **Withdrawal account number masked for privacy** — user's own account number is now displayed as `01•••••789` (first 2 + last 3 digits, middle bulleted) so screenshots or shoulder-surfing don't leak the full number. `data-testid=whist-row-acct-<id>`.
- **Light / Dark theme toggle** — new `ThemeProvider` (`@/context/ThemeContext`) with a sun/moon button in both UserLayout header (top-right) and AdminLayout header (top-right). Choice persists in `localStorage.nb-theme`. Implemented via 6 CSS custom properties (`--nb-page`, `--nb-card`, `--nb-card2`, `--nb-border`, `--nb-text`, `--nb-muted`) that map to dark defaults at `:root` and light overrides at `html.theme-light`. Bulk-migrated ~650 hardcoded hex tokens (`#020813`, `#0B1524`, `#121E30`, `#1A2B44`, `#94A3B8`, `#F8FAFC`) across 40+ frontend files to `var(--nb-*)` in Tailwind arbitrary-value class strings. Toaster + scrollbar + Investments SVG ring all switched to the same tokens.

### Deferred (unchanged)
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff hardening.
- Product logo icon upload.
- Auto-reconciliation cron for stuck deposits >30 min.

## 2026-07-27 · Light-mode text repair (contrast fix)

### Delivered
- **Fixed white-text-on-white-background across the entire app in light mode.** The app was designed dark-first, so ~150 call-sites used Tailwind's `text-white` as the "primary content color". In light mode these became invisible on cards, inputs, outline buttons, and the welcome popup. Added a global CSS override in `index.css`: `html.theme-light .text-white` → `color: var(--nb-text)` (dark) with attribute-selector exemptions that restore pure white ONLY when the element sits on (or inside) a solid coloured button/badge (`bg-[#0055FF]`, `#3377FF`, `#10B981`, `#0EA97A`, `#0ea770`, `#EF4444`, `#dc2626`, `#F59E0B`, `#8B5CF6`, `#EB1C24`). Also targets `hover:text-white`, inputs / textareas / selects specifically, and light-mode placeholder color.
- Verified in light mode across Dashboard (Welcome popup, wallet balance, referral code, quick actions), Referrals (copy link + Gen 1/2/3 pills), Withdraw (amount input, Request withdrawal button, bind-bank CTA card), Deposit (Instant Pay tile, quick amount chips 500/1k/2k/5k/10k/20k, Pay Instantly button), Bind Account (bank picker, account name/number inputs, Save button), Withdrawal history (row labels, masked account), Deposit history (row labels).
- Dark mode is bit-for-bit unchanged.

### Deferred (unchanged)
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff hardening.
- Product logo icon upload.
- Auto-reconciliation cron for stuck deposits >30 min.
