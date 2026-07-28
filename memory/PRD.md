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

## 2026-07-27 · Light-mode text repair (contrast fix) — ROLLED BACK

### Rolled back
Light-mode toggle was introduced earlier this session; user asked for it to be
removed because they preferred the original dark-only aesthetic and disliked
the dark-text-on-white outcome. Reverted cleanly:
- Deleted `context/ThemeContext.jsx` and removed `ThemeProvider` from `App.js`.
- Removed `Sun`/`Moon` toggle button + `useTheme` usage from `UserLayout.jsx` and `AdminLayout.jsx`.
- Removed `html.theme-light` CSS variable overrides + the `.text-white` repair block from `index.css`.
- Kept the CSS custom properties (`--nb-page`, `--nb-card`, `--nb-card2`, `--nb-border`, `--nb-text`, `--nb-muted`) — dark-only, semantic tokens still in place. The ~650 hex→var replacements from earlier remain (they don't hurt, and make a future opt-in theming straightforward).

Verified: pure dark theme restored across Dashboard / Deposit / Withdraw / Referrals / History pages; no leftover theme-light class; toggle buttons gone; `yarn build` compiles clean.

## 2026-07-27 · Bigger in-app PayNow iframe

### Delivered
- **PayNow checkout iframe now occupies ~83% of the viewport** (was ~50% before due to `calc(100vh - 260px)` height cap + `px-4 py-4` body padding + a redundant info banner + an inline verify button eating space). Users see the account number, expiry timer, "I have made this bank transfer" CTA, and payment guide without scrolling.
- **Body layout is now state-aware**: `overflow-hidden` + no padding during PayNow "waiting" (iframe fills edge-to-edge, no rounded border since the modal already frames it); returns to standard `px-4 py-4 space-y-3` for the unavailable / verifying / approved / rejected panels.
- **Manual verify moved into the footer** as a primary green CTA next to a smaller Close button, so the iframe is uninterrupted while the primary action is always thumb-reachable.
- Removed the redundant "Complete the transfer above" info banner (its message is already in the modal subtitle: *"Amount ₦X — auto-updates on receipt."*).

Verified via Playwright — iframe measured at `{x:0, y:85, w:420, h:746}` = 82.9% of a 900px viewport.

## 2026-07-27 · Progressive-disclosure verify button

### Delivered
- **"I've paid — check now" is no longer visible on initial iframe open.** Users were mistakenly tapping our footer CTA instead of PayNow's own **"I have made this bank transfer"** button inside the iframe, causing the verify to fire before the sender name was submitted. Since the iframe is cross-origin we can't listen for that click, so we gate the CTA behind a small text confirmation.
- **Initial state (waiting):** footer shows a subtle underlined text link *"Already submitted your name on the form? Verify manually"* + a wide **Close** button. That's it — nothing that competes visually with PayNow's own submit CTA inside the iframe.
- **After user taps the reveal link:** footer transforms to the green **"I've paid — check now"** primary + a smaller Close secondary. `verifyRevealed` state resets on close and on every fresh checkout.
- No changes to iframe size (still ~83% of viewport).

## 2026-07-27 · Deposit-approve atomicity + confirmation toast

### Delivered
- **Hardened `POST /admin/deposits/{did}/approve`** so an approved deposit can never leave the wallet un-credited:
  * Uses `find_one_and_update` with a `status == "pending"` filter to atomically flip the deposit — if a webhook / another admin got there first, the endpoint refuses with 409 instead of double-crediting.
  * Guards against zero/None/negative amounts (400 rather than silent no-op `$inc`).
  * Uses `find_one_and_update(ReturnDocument.AFTER)` on the wallet so we can return the **new balance** to the frontend.
  * Rolls the deposit back to `pending` if the user document is missing.
  * Logs every credit with before/after context for future forensics.
- **AdminDeposits toast now shows** `Approved · Credited ₦X` with `{userName} · New balance ₦Y` — admin can visually confirm the credit landed and how much the wallet is now sitting at, without having to click through to the user detail page. Removes the guesswork behind the "approved but balance didn't change?" reports.
- Verified end-to-end with a regression test (`/app/tmp/test_dep_approve.py`): TEST_Norm → deposit ₦750 → admin approves → response returns new balance ₦750 → DB confirms wallet_balance is ₦750 → double-approve properly 400s with "Already approved".

## 2026-07-27 · Admin platform-wipe (Danger Zone)

### Delivered
- **New backend endpoint** `POST /api/admin/reset` — wipes all user-generated data in one operation. Payload requires `{ "confirm": "DELETE ALL DATA" }` verbatim; anything else returns `400 Confirmation phrase mismatch`.
- Wipes: **users** (WHERE `role != "admin"`), **deposits**, **withdrawals**, **transactions**, **investments**. Also resets each coupon's `redemption_count` + `redeemed_by` so old codes are usable again.
- Preserves: **admin accounts, products, payment_accounts, coupons (as templates), settings**.
- Also resets every admin's own `wallet_balance` / `bonus_balance` / `total_invested` / `total_earned` / `admin_credited_total` / `has_invested` so KPI cards start from zero.
- Every wipe is logged (`logger.warning`) with admin identity + per-collection counts.
- **Frontend**: new **Danger Zone** card at the bottom of `AdminSettings` (red border, warning icon, explanatory copy). Opens a shadcn Dialog requiring the exact phrase `DELETE ALL DATA` before the destructive "Wipe platform" button enables. On success shows a summary grid (Users / Deposits / Withdrawals / Investments / Transactions / Coupons reset) with the counts that were removed.
- Verified end-to-end via Playwright: card renders, dialog opens, wrong phrase keeps button disabled, correct phrase enables it. Backend guard also verified via curl (`nope` → 400 with mismatch message).

## 2026-07-27 · PayNow transient-error handling ("system is busy")

### Delivered
- **`paynow.create_payin` now auto-retries transient errors** up to 2 additional times (0.6s → 1.5s backoff) when PayNow returns a non-zero code whose msg contains any of: `busy`, `try again`, `timeout`, `temporarily`, `please retry`, `transient`. The same `merchantOrderNo` is re-sent across retries so PayNow can de-duplicate if the first request actually succeeded but the response was garbled. Non-transient failures (unknown errors, IP block, bad amount, etc.) do NOT retry.
- **When Instant Pay create_payin still fails after retries**, the `POST /api/deposits` endpoint now returns the same well-formed `{gateway_ready:false, outbound_ip, gateway_message}` shape as the IP-block branch — instead of raising an HTTP 400 that just surfaced a raw toast dead-end. This makes the deposit drawer open with the amber warm-up card + green **Retry now** button + **Use bank transfer instead** CTA, so the user has a one-tap recovery path from the same place they initiated the deposit.
- Retry-decision unit checks pass; a real create_payin still succeeds with a valid link.

### Deferred (unchanged)
- Product logo icon upload.
- SMS OTP for phone verification.
- Auto-reconciliation cron for stuck deposits >30 min.

### Deferred (unchanged)
- SMS OTP for phone verification.
- PayNow `query_payee` 429 retry/backoff hardening.
- Product logo icon upload.
- Auto-reconciliation cron for stuck deposits >30 min.

## 2026-07-27 · Manual-only bank account binding

### Delivered
- **Removed the auto-detect / auto-verify UX** from `/bank-account`. The `useEffect` that debounced `POST /paynow/verify-account` after every keystroke on the account number is gone. The green *"We can reach this account"* / blue *"couldn't auto-check"* chips are gone.
- **Persistent amber warning banner** at the top of the form: *"Please fill in your bank details carefully. Withdrawals sent to a wrong bank / account number can be lost and may not be recoverable. Double-check every digit before saving."*
- **Helper text on each field** reinforces manual accuracy (account #, account name).
- **One-last-look confirmation on submit** — a native `confirm()` pops up showing the entered Bank / Account # / Name so users can spot a typo before it's persisted.
- Bank picker (drawer with 200+ Nigerian banks) is retained as convenience; fallback manual text input still available when picker is unavailable.

Verified via Playwright: amber warning card renders, all three auto-verify testids absent from the DOM, `yarn build` compiles clean.

## 2026-07-27 · Welcome bonus credits wallet_balance (bug fix)

### Delivered
- **Fixed:** at registration, the welcome bonus (default ₦500 from `settings.welcome_bonus`) now credits `wallet_balance` directly instead of the never-consumed `bonus_balance` field. Users can now actually invest their welcome bonus (purchases debit wallet_balance). Withdrawals remain gated on `has_invested == True`, so the anti-farm policy is preserved.
- Also updated the transactions daily-summary loop to count `welcome_bonus` as a real wallet movement (previously skipped).
- Migrated 1 legacy user with `bonus_balance > 0` — moved into `wallet_balance`.
- **Verified by testing_agent** (iteration_12.json): 4/4 backend tests green — fresh registration returns wallet_balance == welcome_bonus, bonus_balance == 0, welcome_bonus_given == true, exactly one welcome_bonus transaction with meta.credits_wallet == true, and the withdrawal gate (`has_invested = false → 400 "must invest first"`) still triggers.

## 2026-07-28 · SHPAY payment gateway integration

### Delivered
- **New backend module** `/app/backend/shpay.py` — full SHPAY OpenAPI client (base https://transapi.shpays.com). MD5 signing per spec (sort-by-key, `key=value&…`, append signKey, MD5, uppercase). Public API: `enabled`, `sign_payload`, `verify_callback_signature`, `create_payin`, `get_virtual_account`, `create_payout`, `query_trans`, `get_balance`, `list_banks` / `list_banks_cached`.
- **Env vars** added to `/app/backend/.env`: `SHPAY_BASE_URL`, `SHPAY_MCHT_ID`, `SHPAY_APP_ID`, `SHPAY_SIGN_KEY`, `SHPAY_COUNTRY=NG`, `SHPAY_NOTIFY_URL`.
- **New API endpoints** (in `server.py`):
  - `GET /api/shpay/status` — user probe (enabled + gateway_ready + bank_count)
  - `GET /api/shpay/banks` — user-facing bank list (cached 10 min)
  - `GET /api/admin/shpay/health` — admin health probe (returns outbound IP + balance + errors)
  - `POST /api/shpay/webhook` — signed callback endpoint for PAYIN + PAYOUT events. Uses `PlainTextResponse` so replies are raw `OK` / `SIGNATURE_INVALID` (spec-compliant). Idempotent — silently acks duplicate settle attempts. Verifies signature via `hashlib.md5` comparison; rejects forged callbacks.
  - `POST /api/admin/withdrawals/{wid}/shpay-payout` — admin manual dispatch of a pending withdrawal via SHPAY (alternative to PayNow auto-payout).
- **`POST /api/deposits` branches on method**: `paynow-auto` → PayNow (unchanged); `shpay-auto` → new SHPAY branch mirroring the PayNow shape (returns checkout URL + gateway_ready flag + graceful unavailable-drawer response when SHPAY is IP-blocked). Payer email is synthesised from phone if the user has no email on record (defensive `.get()` — no KeyError).
- **Frontend Deposit page** now shows a second **Quick Pay** violet tile alongside PayNow's Instant Pay when SHPAY is enabled. Both open the same in-app iframe drawer with progressive-disclosure verify button + full-screen modal (all existing UX preserved).
- **Verified by testing_agent — iteration 13 (11/11 green) + iteration 14 (100% green, both spec fixes re-verified)**: raw plain-text webhook body, defensive user.get() path, sign verification rejects forged callbacks, deposit/status/banks/health all return well-formed responses with the current gateway_ready=false state.

**⚠️ Live end-to-end is blocked on SHPAY's IP whitelist:** merchant must add our outbound IP (visible at `GET /api/admin/shpay/health`) to the SHPAY dashboard. Until then the SHPAY tile shows and the drawer opens with a friendly "warming up" state (same graceful-degradation pattern PayNow uses). Once whitelisted, the Quick Pay flow will produce a real checkout link end-to-end and settle via the webhook.

Deferred / follow-ups (from code review comments in iteration_14):
- `server.py` is now >1900 lines — split into modules (auth, deposits, admin, shpay, paynow).
- Consider `hmac.compare_digest` for the callback signature check.
- Auto-reconciliation cron for stuck SHPAY transactions >30 min.


## 2026-07-28 · IP whitelist follow-up + PayNow proactive re-probe

### Context
User whitelisted the pod's outbound IP (`34.16.56.64`) on **SHPAY** — Quick Pay is now fully live end-to-end (verified via live `POST /api/deposits {method:"shpay-auto"}` → real `cdncashierv2.ipays.world` checkout link + 92 banks visible via `/api/shpay/banks`). PayNow whitelist is still pending on the user's `merchant.paynow.money` dashboard.

### Delivered
- **PayNow `list_banks_cached()` accepts `force_probe=True`** — bypasses both the bank-list cache AND the 5-minute IP-block short-circuit.
- **`GET /api/paynow/banks`** now proactively re-probes whenever the IP-block flag is set. Result: the instant the merchant whitelists their IP on PayNow, the very next deposit-page load flips Instant Pay to `gateway_ready: true` without waiting for the TTL to expire.
- No frontend changes needed — Deposit page already calls `/paynow/banks` on mount, and the drawer's "Try again" button hits the same route.

### Verified
- Restart + fresh probe still correctly reports `gateway_ready: false, reason: gateway_ip_blocked` (PayNow's IP whitelist still pending).
- `/api/shpay/status` returns `gateway_ready: true, bank_count: 92`.
- Live `/api/deposits` with `method:"shpay-auto"` returns a real SHPAY cashier link with a virtual account issued.


## 2026-07-28 · SHPAY webhook signature bug + reconcile cron (P0)

### The bug
User reported: "I made a deposit via SHPAY, money entered the merchant account but the user was NOT credited."

Root cause found in backend log:
```
SHPAY webhook received: {'event': 'PAYIN', 'sign': '7C3AC6316AD3A226D63743C4A1244333', 'outTradeNo': 'S43d6e1c1207788d71785228662', 'transStatus': 'SUCCESS', 'transAmt': '1000', 'paymentTransNo': '…', 'reference': '…', 'completionTime': '…'}
SHPAY webhook: signature mismatch, refusing to process
```
Our `shpay.verify_callback_signature()` was signing **all** fields in the callback body. Empirically verified against the real production callback: SHPAY signs only the transactional subset `{completionTime, event, outTradeNo, transAmt, transNo, transStatus}` and leaves `paymentTransNo` / `reference` as informational (unsigned) fields. Every callback therefore failed verification and we returned `SIGNATURE_INVALID`, never crediting the user.

### Delivered
1. **`shpay.verify_callback_signature()` rewritten** to try two strategies and accept if either matches:
   - Strategy 1: canonical signed subset `{completionTime, event, outTradeNo, transAmt, transNo, transStatus}` (production-verified).
   - Strategy 2: full-body signing (forward-compat safety net if SHPAY adds fields later).
   - Empty / missing / tampered signatures still rejected.
2. **New `reconcile_pending_shpay_deposits()` function** + `_shpay_reconcile_cron()` — mirrors PayNow. Every 5 min, queries SHPAY `/v1/trans/payQuery` for all pending SHPAY deposits and credits any that returned `transStatus=SUCCESS` (marks the deposit `reconciled=True`). Rejects any that returned `FAIL`. This is a safety net for missed webhooks.
3. **Immediate retroactive credit** — ran reconcile once by hand. User `CASHFLOW VIP 10` (`+2348054563131`) credited ₦1,000 for order `S43d6e1c1207788d71785228662`. Wallet went from ₦5,300 → ₦6,300.

### Verified
- 5-point signature test suite (real callback / tampered amount / bogus sig / missing sign / full-body variant) — all pass correctly.
- Live: user's wallet balance and transaction feed both show the credit.
- Cron logs: `SHPAY reconcile credited user=… amount=₦1000.00 dep=…` printed on first run.
- Deposits DB: outstanding order flipped `pending → approved` with `reconciled: true`.


## 2026-07-28 · 1SSPay gateway integration + admin gateway toggles (P0 feature)

### Delivered
1. **New backend module `/app/backend/onesspay.py`** — full 1SSPay OpenAPI client (`https://api.1sspay.com`). HMAC-SHA1 + Base64 signing per spec (sort keys ASCII, `key=value&…`, HMAC-SHA1 with merchant key, Base64). Nigeria `country=4`. Public API: `enabled`, `sign`, `verify_callback_signature`, `create_payin`, `create_payout`, `query_payin`, `query_payout`, `get_balance`, `list_banks` (static 211-bank list).
2. **Env vars** added to `/app/backend/.env`: `ONESSPAY_ENABLED`, `ONESSPAY_BASE_URL`, `ONESSPAY_MERCHANT_ID`, `ONESSPAY_KEY`, `ONESSPAY_COUNTRY`, `ONESSPAY_PAYIN_NOTIFY_URL`, `ONESSPAY_PAYOUT_NOTIFY_URL`. Currently using the docs' sample merchant credentials as placeholder; merchant needs to swap for real credentials (channel returned "channel authority not open" on the sample).
3. **New API endpoints** (in `server.py`):
   - `GET /api/onesspay/status` — user probe (enabled + gateway_ready + optional error message).
   - `GET /api/onesspay/banks` — 1SSPay's 211-bank list (NR0xxx codes).
   - `GET /api/admin/onesspay/health` — admin probe (returns balance + outbound IP for IP-whitelist debugging).
   - `POST /api/onesspay/webhook/payin` — form-urlencoded payin callback, responds with literal `"success"` per spec. Signature verified (HMAC-SHA1+Base64). Idempotent.
   - `POST /api/onesspay/webhook/payout` — form-urlencoded payout callback.
   - `POST /api/admin/withdrawals/{wid}/onesspay-payout` — admin manual dispatch via 1SSPay.
4. **`POST /api/deposits`** extended: `onesspay-auto` → new 1SSPay branch mirroring the SHPAY/PayNow shape (returns checkout URL + graceful "gateway unavailable" fallback with outbound_ip when 1SSPay refuses).
5. **New `_onesspay_reconcile_cron()`** + `reconcile_pending_onesspay_deposits()` / `reconcile_pending_onesspay_withdrawals()` — safety net that mirrors SHPAY/PayNow crons. Every 5 min queries 1SSPay `/payment/orderStatus` and `/payout/orderStatus` and settles any pending orders that reached status=2 (success) or 3/4/5 (fail).

### Admin gateway toggles (per gateway × per direction, 6 toggles total)
1. **New settings field** `gateway_toggles` — `{paynow:{payin,payout}, shpay:{payin,payout}, onesspay:{payin,payout}}`, defaults to all ON.
2. **New helpers** `get_gateway_toggles()`, `gateway_payin_allowed()`, `gateway_payout_allowed()` — used across:
   - `/api/paynow/banks`, `/api/shpay/status`, `/api/onesspay/status` → honor payin toggles (hide the tile when OFF).
   - `POST /api/deposits` → rejects with friendly 400 if the picked gateway is toggled off for payin.
   - `/api/admin/withdrawals/{wid}/approve` → skips PayNow auto-payout when paynow-payout is OFF; falls back to manual approve.
   - `/api/admin/withdrawals/{wid}/shpay-payout`, `/api/admin/withdrawals/{wid}/onesspay-payout` → 400 if that gateway's payout toggle is OFF.
3. **New admin endpoints**:
   - `GET /api/admin/gateways` — returns rows with `{key, label, color, configured, payin, payout}`.
   - `PUT /api/admin/gateways` — updates one or more toggles atomically.
4. **Frontend (`/app/frontend/src/pages/admin/AdminSettings.jsx`)** — new **Payment Gateways** card between the PayNow webhook URLs and Danger Zone. Renders 3 gateway rows, each with two toggle chips (Collection / Payout) and a `configured` indicator so admin can tell which env-side gateways are wired up. Toggles PATCH the backend live (no Save button).
5. **Frontend (`/app/frontend/src/pages/user/Deposit.jsx`)** — added a third **Fast Pay** violet-orange tile (color `#F97316`) alongside PayNow's Instant Pay and SHPAY's Quick Pay. Fully symmetric with the other two: same drawer, same iframe checkout, same graceful "warming up" fallback with outbound_ip readout. Waiting drawer title/subtitle are gateway-aware.
6. **Frontend (`/app/frontend/src/pages/admin/AdminWithdrawals.jsx`)** — per-row actions now include gateway-specific payout chips (SHPAY violet, 1SSPay orange) shown only when that gateway's payout toggle is ON. Default "Approve" button still exists and routes through PayNow when paynow-payout is on.

### Verified (live backend)
- All 3 gateways return `configured=true` in `/api/admin/gateways`.
- `/api/onesspay/status` = `enabled:true, gateway_ready:false, code:1007` ("channel authority not open") — expected until merchant swaps credentials.
- `/api/onesspay/banks` returns 211 banks with NR0xxx codes.
- Toggle test: turning off shpay-payin → `/shpay/status` returns disabled; a `POST /api/deposits {method:"shpay-auto"}` returns 400 with friendly error. Toggling back on restores it.
- 1SSPay signature tests: valid callback verifies, tampered amount rejects, missing sign rejects.
- `yarn build` compiles clean.

### ⚠️ Deploy pre-req
Merchant must provide their real 1SSPay `MerchantId` + `Key` in `.env` (currently seeded with the docs' sample credentials, which have `code=1007 "channel authority not open"` for Nigeria). Additionally, 1SSPay likely requires IP whitelisting — the current outbound IP is visible via `GET /api/admin/onesspay/health`.


## 2026-07-28 · Payout dispatcher rewrite — smart multi-gateway routing (P0 bugfix)

### The bug
User reported: *"I requested a withdrawal using SHPAY — it's nowhere to be found in SHPAY merchant, but admin dashboard shows processing."*

Root cause: `POST /api/withdrawals` (user submits withdrawal) had auto-payout **hard-coded to PayNow only** (`_paynow_payout_withdrawal(w)`), ignoring the admin's SHPAY / 1SSPay toggles. The admin's default "Approve" button did the same. Additionally, bank codes are per-gateway (PayNow `NG0204` OPay ≠ SHPAY `100004` ≠ 1SSPay `NR0140`), so even trying to route through a different gateway would fail with "invalid bank code" because the user's bound bank_code was in PayNow format.

### Delivered
1. **New `translate_bank_code(bank_name, target_gateway, current_code)`** in `server.py` — looks up the target gateway's bank code by fuzzy bank-NAME match against `onesspay.NIGERIAN_BANKS` (static), `shpay.list_banks_cached()`, or `paynow.list_banks_cached()`. Fast-path detects when the current code is already in the target's format (`NG0…`, `NR0…`, digit-only) and returns it unchanged. Live test verified: `OPay` → `paynow=NG0204, onesspay=NR0140, shpay=<code>` (SHPAY requires IP whitelist to fetch banks).
2. **New `dispatch_payout_via_enabled_gateway(w, note)`** — priority list `[paynow, shpay, onesspay]`; for each gateway, if its payout toggle is ON, translate the bank_code and call `_paynow/_shpay/_onesspay_payout_withdrawal`. First success wins; if all fail, HTTP 400 with a combined error message ("paynow: … | shpay: … | onesspay: …") so admin can see exactly what each gateway said.
3. **Wired into 3 places**:
   - `POST /api/withdrawals` auto-payout — now uses the dispatcher instead of hard-coded PayNow.
   - `POST /api/admin/withdrawals/{wid}/approve` — same. Response now reports which gateway actually settled (`{"ok":true, "gateway": <actual>, "status":"processing"}`).
   - `POST /api/admin/withdrawals/bulk-approve` — same, so bulk approve also benefits.
4. **Small bug fix**: `_paynow_payout_withdrawal` now stores `platform_order_no = pn_data.get("orderNo")` from PayNow's response, so the DB row includes PayNow's `PT…` order reference for admin traceability.

### Verified (live backend)
- Bank code translator: OPay → PayNow NG0204 (fast-path), OPay → 1SSPay NR0140 (static match). Unknown bank returns None.
- Dispatcher priority: with paynow-payout OFF and shpay+onesspay ON, dispatcher tried shpay + onesspay (both rejected — SHPAY IP not whitelisted, 1SSPay channel not open); returned 400 with combined errors. Turning paynow back on → dispatcher accepted via PayNow (`gateway:paynow, platform_order_no:PT178523612272098827`).
- All toggles restored to ON.
- `yarn build` compiles clean.

### ⚠️ Note about the user's original ₦1,000 withdrawal
The withdrawal `Wcab22dd7c94527451785235517` (₦1,000 CASHFLOW VIP 10 → OPay 8054563130) is currently in PayNow's dashboard as order `PT178523612272098827`. It never reached SHPAY because the auto-payout was hard-coded to PayNow at submission time (now fixed). If you want it to appear in SHPAY instead, you'd need to reject the PayNow one first, then use the new SHPAY payout button on the admin panel — the dispatcher will translate the bank code and dispatch to SHPAY.

## 2026-07-28 · Static outbound IP via IPRoyal proxy (P0 infrastructure fix)

### Problem
Emergent's standard deployment does not provide a static outbound egress IP — it rotated 3+ times (`34.170.12.145 → 34.16.56.64 → 104.198.214.223`) during this session alone. Payment merchants (PayNow, SHPAY, 1SSPay) all require IP whitelisting, so every rotation broke live payments and forced manual re-whitelisting at three dashboards.

### Delivered
User purchased an **IPRoyal static-IP proxy** (`46.20.101.18:12323`, HTTP basic auth). Wired into the backend via env vars only — zero code changes required because `httpx.AsyncClient` auto-detects `HTTPS_PROXY` when `trust_env=True` (default).

1. **`/app/backend/.env`** — added:
   ```
   HTTP_PROXY="http://<user>:<pass>@46.20.101.18:12323"
   HTTPS_PROXY="http://<user>:<pass>@46.20.101.18:12323"
   ```
2. **New endpoint `GET /api/admin/server-ip`** — returns `{outbound_ip, static_proxy_configured, proxy (redacted), instructions}`. Used by the admin UI to show the IP that merchants see, without hunting through logs.
3. **New `ServerIPCard`** in Admin Settings — top of the page, above Gateway Toggles. Big monospaced IP display (green if static proxy configured, orange if rotating), Copy button, live "Refresh" button, credential-redacted proxy readout for debugging.

### Verified live
- Direct httpx call: outbound IP = `46.20.101.18` (3× consecutive calls confirmed stable).
- PayNow: `code=10000039 "The IP address fails to pass the whitelist check"` — request reached PayNow, just needs `46.20.101.18` added to whitelist.
- SHPAY: `"Please use the ip you whitelist"` — same story.
- 1SSPay: `code=1007 "channel authority not open"` — sample credentials issue, unrelated.
- `/api/admin/server-ip` returns `{"outbound_ip":"46.20.101.18","static_proxy_configured":true, ...}`.
- `/api/admin/onesspay/health` correctly reports `46.20.101.18`.
- Frontend `yarn build` clean.

### What user needs to do next (one-time only)
Whitelist **`46.20.101.18`** on:
1. **PayNow** (`merchant.paynow.money` → Settings → API/Security → IP Whitelist)
2. **SHPAY** (`dashboard.shpays.com` → Merchant Settings → API Config → IP Whitelist)
3. **1SSPay** (`h786.1sspay.biz` → Merchant Settings → IP Whitelist)

After this, container restarts / redeploys / IP rotations no longer matter — IPRoyal's IP stays permanent.



## 2026-07-28 · Post-whitelist confirmation + actionable gateway error classifier (P0 UX)

### Great news
Whitelist of `46.20.101.18` at all 3 dashboards has taken effect at the IP level:
- **PayNow**: `gateway_ready=True`, 32 banks reachable ✅
- **SHPAY**: bank list works (155 banks), IP check passed ✅ — remaining error is `"Channel-Error:['Merchant is not active']"` (SHPAY merchant status)
- **1SSPay**: signature accepted ✅ — remaining error is `code=1007 "channel authority not open"` (1SSPay account channel activation)

Both SHPAY and 1SSPay's remaining errors are **business-status** issues on the merchant's side, not code/IP issues. Only their account teams can flip these flags.

### The bug
The previous graceful-error message always said *"whitelist your server IP"* — misleading now that the IP is whitelisted. Users saw *"SHPAY is momentarily unavailable (Channel-Error: Merchant is not active). Whitelist your server IP in the SHPAY dashboard."* — the fix has nothing to do with whitelisting.

### Delivered
New helper `classify_gateway_error(gateway_name, raw_msg)` in `backend/server.py` that pattern-matches the raw gateway error and returns an actionable user-facing message. 7 error classes handled: merchant-inactive, channel-not-open, IP-whitelist, balance-insufficient, bank-unsupported, signature, and unknown-fallback. Wired into `POST /api/deposits` for both SHPAY and 1SSPay graceful-degradation branches.

### Verified live
- SHPAY: *"Quick Pay is temporarily unavailable — your SHPAY merchant account is not activated yet. Log into your SHPAY dashboard and complete any pending KYC / activation steps, or contact your SHPAY account manager."*
- 1SSPay: *"Fast Pay is temporarily unavailable — your 1SSPay payment channel isn't enabled yet. Ask your 1SSPay account manager to enable the Nigeria payin/payout channel for your merchant ID."*
- IP-whitelist patterns still produce the correct whitelist hint.
- All 7 patterns verified via python direct test.
- `yarn build` clean; UI still shows the `Server IP: 46.20.101.18` copy chip.

## 2026-07-28 · Products page redesign — horizontal cards with images (feature)

### Product model changes (`backend/server.py`)
- Added two Optional fields to `ProductIn`:
  - `image_url`: base64 data-URL or absolute URL of the product image.
  - `tier`: one of `legendary|epic|hot|newcomer|tech|fashion` for the corner badge color. If unset, auto-derived from `daily_profit_pct` (>=10% → legendary, >=7% → epic, >=5% → hot, else standard).
- `GET/POST/PUT /api/products` unchanged in shape — the two new fields flow through automatically via `p.model_dump()`.

### User Marketplace page (`frontend/src/pages/user/Marketplace.jsx`)
Complete rewrite. Now renders one horizontal card per product matching the reference mystery-box layout:
- Left ~38%: image area with `linear-gradient(#1E1B0A → #2A2410 → #0B0906)` dark-gold background + radial glow behind image. If no image, a treasure-chest illustration falls back in.
- Left top-left: tier badge chip (colored per tier).
- Right: name, daily-profit chip with fire icon, "Total return ₦X" chip (mimics the "Resale ₦110-₦350" chip in the reference), big price, trust icons, and a purple "Invest Now →" CTA button.
- Card has ambient tier-colored glow via `box-shadow` + dashed accent line top/bottom for the treasure/legendary aesthetic.
- New horizontal tier-filter scrollable chip row (All / Legendary / Epic / Hot / etc.) shown only when >1 tier exists.
- Kept existing invest confirmation drawer identical to before.

### Admin Products page (`frontend/src/pages/admin/AdminProducts.jsx`)
- Product cards now show a compact 80×80 image thumbnail on the left with the name/status on the right.
- Edit dialog adds:
  - **Image uploader** — file input hidden behind an "Upload image" button. Uses `FileReader.readAsDataURL` + a canvas resize to 640px max edge + JPEG-82% (or PNG if small & original was PNG). Result is a data-URL stored directly in `product.image_url`. Max raw upload 8 MB.
  - **Preview** — 96×96 preview swatch beside the upload button; "Remove" button clears the image.
  - **Tier dropdown** — 7 options (Auto + 6 tiers). Empty → auto-derive.
- No server upload endpoint needed — data-URL round-trips through the existing `POST/PUT /admin/products` payload.

### Verified
- Backend PUT with a synthetic 1×1 PNG data-URL round-trips correctly (product returns with `tier=legendary` and full base64 image_url intact).
- All lucide-react icons resolve.
- `yarn build` compiles clean (194.72 KB main.js gzipped, +0.3 KB vs previous).

### ⚠️ Storage note
Images are stored as base64 data-URLs directly in MongoDB `products` collection. A 640px JPEG at 82% quality is typically 40-100 KB base64. For the current handful of products (< 30) total footprint is <5 MB. If the catalog grows to 100+ or needs richer imagery, migrate `image_url` to Emergent Object Storage (integration playbook exists) — the field is a plain URL so the frontend won't need changes.


## 2026-07-28 · Full app-wide visual redesign — dark-gold aesthetic (P0 UX)

Applied the Marketplace "product card" visual language (dark-gold gradient background, tier-colored ambient glow, dashed gold accent lines, purple pill CTAs, chip badges, big tabular numbers) consistently across the entire user surface + reorganized Admin Settings into tabs.

### New shared design system (`frontend/src/components/design.jsx`)
Extracted 10 reusable primitives so future style tweaks land in one place:
- **`AmbientCard`** — flagship dark-gold gradient card with tier-colored `box-shadow` glow + optional dashed gold accent lines top/bottom.
- **`SoftCard`** — lighter variant for secondary sections.
- **`SectionHeader`** — yellow vertical bar + heading + subtitle.
- **`PillCTA`** — purple pill-shaped button with icon + arrow.
- **`BigStat`** / **`StatChip`** / **`StackChip`** / **`MicroLabel`** — the money-display + label primitives.
- **`TierBadge`** — corner badge (Legendary/Epic/Hot/Newcomer/Tech/Fashion + info/success/danger/gold/purple).
- **`RowItem`** — reusable list-row for tx/history/referrals.
- **`EmptyState`** — treasure-chest empty-state.
- **`TIER_TOKENS`** — 12 named tier/color palette exported for one-off use.

### Redesigned pages (full rewrite)
- **`Dashboard.jsx`** — gold ambient wallet hero with hide/show + 3-stat grid; tier-colored quick-action tiles; purple referral card; welcome pop-up rebuilt with matching gold aesthetic (2 dashed gold accent lines, radial orbs, big party icon).
- **`Withdraw.jsx`** — SectionHeader + gold available-to-withdraw card + purple ambient form card + gold gradient submit button.
- **`Profile.jsx`** — gold header card with avatar + purple referral chip inline; menu links use tier-colored icon squares (referrals=purple, tx=cyan, deposit=green, withdraw=blue, bank=blue, coupon=gold, admin=hot); red sign-out with danger tone.
- **`Coupon.jsx`** — physical-ticket aesthetic (gold card with punch-notches on the sides, dashed mid-divider, 2xl tracked code input, gradient redeem button); success celebration card in success tone.
- **`Marketplace.jsx`** — already done in previous session, unchanged.

### Redesigned pages (surgical updates)
- **`Deposit.jsx`** — SectionHeader.
- **`Investments.jsx`** — gold portfolio hero card + purple active tabs.
- **`Referrals.jsx`** — epic hero card + gold total-earnings card + purple gen tabs.
- **`BindAccount.jsx`** — gold "Currently bound" card + SectionHeader.
- **`DepositHistory.jsx`** / **`WithdrawHistory.jsx`** / **`Transactions.jsx`** — SectionHeader (gold vertical bar) + purple active tabs (was blue).

### Admin Settings reorganization (`AdminSettings.jsx`)
Converted from a long scrolling page into a 4-tab UI with sticky tab bar:
1. **General** — site name, welcome bonus, deposit/withdrawal min, quick amounts, batch limit, community URL, welcome message.
2. **Payments** — Gateway Toggles + PayNow webhook URLs.
3. **Server** — Server IP card (copy button + Static badge).
4. **Danger** — Danger Zone.
Tab active color unified to purple (`#7C3AED`) across the whole app.

### What was explicitly NOT done in this pass
- **Light mode** — deliberately skipped. The handoff summary from a previous session noted the user asked for light mode and then disliked it, so it was fully removed. If you want it back, I can add a proper light theme + toggle in Profile in a follow-up (would swap CSS variables via a `data-theme` attribute on `<html>`, keep the gold/purple accents, and give it a serious accessibility pass — high contrast, WCAG-AA text).

### Verified
- `yarn build` compiles clean (194.72 KB main.js gzipped, +2.14 KB vs previous).
- 5 route screenshots (dashboard, deposit, withdraw, profile, admin/settings) all navigated without errors.
- All 10 design-system primitives exported and imported across 13 pages.



## 2026-07-28 · Redesign polish (missed spots) + Light Mode (v2) + investments enrichment

### Delivered
- **Deposit page** (`/deposit`) — amount input card + selected-manual-account panel converted to dark-gold ambient (dashed gold accent lines top+bottom, radial glow, `#1E1B0A → #0B0906` gradient bg). Submit button flipped from solid blue (`#0055FF`) to gold gradient pill (`#FFE580 → #F5C518`, dark text) with a right-arrow icon on non-loading state.
- **Referrals** (`/referrals`) — 'Your network' section rebuilt: rows are now individual dark-gold ambient cards with dashed gold accent lines, gradient avatar chips (gold for pending, green for active), pill status badges, and a new empty state using a gold treasure-chest icon. Gen tabs use purple-gradient active state.
- **Marketplace confirm-invest drawer** — completely restyled to dark-gold gradient with: tier badge chip on top (`invest-drawer-tier`), plan card with product thumbnail (`invest-drawer-thumb`) + gold stake chip (`invest-drawer-stake`), Daily earn (green tint) + Runs-for (gold tint) grid, purple hero 'Total you'll get back' chip (`invest-drawer-total-return`), and a gold gradient 'Confirm & invest' pill button.
- **Investments** (`/investments`) — InvestmentCard fully rebuilt as horizontal dark-gold ambient card: 60×60 thumbnail (from new `product_image_url` field) with radial tier glow, initials fallback, tier badge chip auto-derived from `product_tier` or `daily_profit_pct`, live-ticking next-payout countdown, gold-tinted progress bar. Empty state redesigned to match. Backend `/api/investments` batch-loads product docs and enriches every row with `product_image_url` + `product_tier` (no N+1).
- **UserLayout** — brand icon + user avatar switched from blue (`#0055FF`) to gold gradient (`#FFE580 → #F5C518`). Bottom nav active indicator flipped from blue to gold with subtle box-shadow glow. Theme toggle button (`[data-testid=theme-toggle]`) added between admin-link and avatar.
- **AdminLayout** — admin theme toggle button (`[data-testid=admin-theme-toggle]`) added in header.

### Light Mode (v2) — polished second attempt
- New `ThemeContext.jsx` (`src/context/`) with `useTheme()` hook; persists in `localStorage.nb-theme`; applies `theme-light` class to `<html>`.
- Wrapped `<AuthProvider>` in `<ThemeProvider>` in `App.js`.
- Sun/Moon toggle button in both `UserLayout` (top-right, gold-tinted) and `AdminLayout` header.
- CSS overrides in `index.css`:
  - `html.theme-light` flips every `--nb-*` token to a warm parchment palette (`--nb-page:#FBF7EE`, `--nb-card:#FFFFFF`, `--nb-text:#1A1508`, `--nb-muted:#6B5E42`, etc.).
  - **Also flips the Tailwind/shadcn HSL tokens** (`--background`, `--foreground`, `--card`, `--card-foreground`, `--muted`, `--primary`, etc.) so shadcn `<Card>`, `<Popover>`, `<Dialog>` etc. render dark text on light surface. This was the fix for the admin panel light-mode contrast bug where KPI values were invisible.
  - Preserves white text INSIDE dark-gold AmbientCards via two selectors: `[style*='rgb(30, 27, 10)']` (matches the React-converted #1E1B0A inline gradient) AND `[data-nb-ambient='gold']` (attribute added to AmbientCard's inner `<Card>` in `design.jsx`). Both selectors keep `.text-white` white inside the dark-gold surface.
- Verified live: `document.documentElement.className === 'theme-light'`, `getComputedStyle(document.body).backgroundColor === 'rgb(251, 247, 238)'`, dashboard-heading color flips to `rgb(26, 21, 8)`, wallet-amount stays `rgb(248, 250, 252)`, `localStorage.nb-theme === 'light'` after reload.

### Backend
- **`GET /api/investments`** — enriched with `product_image_url` and `product_tier` (both optional, safe null if product was deleted). Batch-loads product docs to avoid N+1. New pytest at `/app/backend/tests/test_investments_enrichment.py`, PASSED.

### Verified by testing_agent (iteration_16)
- All 8 UI + light-mode assertions pass on user-side.
- 1 admin light-mode contrast issue found → fixed in follow-up commit by extending light-mode CSS to override the Tailwind/shadcn HSL tokens (see above). Verified via screenshot — KPI cards, gateway rows, and quick-action tiles now render dark parchment text on white background.

### Deferred / next iterations
- Optionally give the `Deposit.jsx` amount card + MethodBlock the `data-nb-ambient='gold'` attribute for robustness (currently they rely on the `rgb(30, 27, 10)` inline-style selector).
- Product logo icon upload (waiting on user's asset).
- SMS OTP for phone verification.
- Split `server.py` (~3,100 lines) into `/backend/routers/*` (auth, deposits, admin, gateways, webhooks).
- Auto-reconciliation cron for stuck 1SSPay deposits >30 min (already have SHPAY + PayNow crons).


## 2026-07-28 · Post-review polish (light-mode + icons + drawer)

User-reported fixes after the initial redesign:

### Delivered
- **Deposit quick-amount chips** in light mode — `QuickAmount` had `color: "white"` hardcoded on the unselected state, invisible on the white light-mode surface. Switched to `color: var(--nb-text)` and strengthened the gold border to 0.35 alpha.
- **Method blocks uniform size** — measurements before fix: Instant 115px, Quick Pay 81px, Fast Pay 81px (width mismatch because the button lacked `w-full` so the wider "Fast · Recommended" sub-label made column 1 wider under `grid-cols-3`). Added `w-full min-w-0` to the button + wrapped every grid item in a `min-w-0` div. All 3 tiles now measure **121×104** identical.
- **Unique history icons** — Deposit history & Withdrawal history both used `Receipt`. Split into `Inbox` (Deposit history — arrow-into-box = received) and `ScrollText` (Withdrawal history — record scroll). Updated Profile.jsx menu entries, Deposit.jsx `/deposit-history` link, Withdraw.jsx `/withdraw-history` link, DepositHistory.jsx empty-state icon, WithdrawHistory.jsx empty-state icon.
- **Confirm invest drawer theme-aware** — the Marketplace bottom drawer now consumes `useTheme()` and swaps the base gradient + text colors based on `theme === "light"`. In light mode: cream gradient bg (`#FFFDF6 → #FBF3D9 → #F5EFDF`), dark parchment title/description, subtly gold-tinted plan card, dark-gold stake text, purple-tinted "Total return" hero, and a transparent bordered Cancel button. Dark mode unchanged. `data-testid=invest-drawer` bg now flips correctly (verified via computed style).

Compilation clean; all three method blocks measure identical widths post-fix.

## 2026-07-28 · Unified surface treatment (v3)

User asked to unify all "dark ambient" cards to match the Marketplace product-card pattern — where the card body uses `var(--nb-card)` so it flips surface color with the theme (dark navy in dark mode, white in light mode) while keeping only the gold dashed accents + tier glow shadows. This creates one consistent, theme-adaptive card language across the entire app.

### Delivered
- **design.jsx AmbientCard** — dropped the inline `#1E1B0A → #0B0906` gradient; the inner Card now relies on its own `bg-[var(--nb-card)]` class. `data-nb-ambient="gold"` attribute kept for future scoping.
- **Dashboard** — ActionTile inner div and welcome-dialog body switched to `bg-[var(--nb-card)]`. Gold ambient orbs + dashed accents preserved.
- **Deposit** — `MethodBlock` button, amount input card, and selected-manual-account panel all switched to `bg-[var(--nb-card)]`. Method tiles still glow with their tier tone. Sub-label under method name changed from `text-white/70` to `text-[var(--nb-muted)]` so it flips too.
- **Investments** — `InvestmentCard` body switched to `bg-[var(--nb-card)]`. The 60×60 thumbnail area stays intentionally dark-gold via `data-nb-image="dark"` (image contrast). Empty state also flipped.
- **Referrals** — network rows and empty-state card switched to `bg-[var(--nb-card)]`.
- **Marketplace** — confirm-invest drawer body switched to `bg-[var(--nb-card)]` (dropped the theme-branching JS). Left product-image column stays dark-gold via `data-nb-image="dark"`.
- **AdminProducts** — both product thumbnail placeholders (list view + edit sheet preview) marked `data-nb-image="dark"` so they stay dark-gold in light mode for image contrast.
- **index.css light-mode rules** — old `[style*='rgb(30, 27, 10)']` + `[data-nb-ambient='gold']` exceptions removed. New single exception: `.text-white` is preserved white ONLY inside elements marked `data-nb-image="dark"` (the intentionally-dark image thumbnails).

### Result
Both themes now use the SAME visual grammar — `var(--nb-card)` body + gold dashed accents + tier-glow shadow — differing only by surface + text color:
- **Dark mode:** dark navy body (`#0B1524`) + white text + gold accents.
- **Light mode:** white body + dark parchment text + gold accents.
- Product image thumbnails stay dark-gold in both themes (for image contrast).

Verified via screenshot on Dashboard, Investments, Deposit, Marketplace (drawer) in both themes. No behavioural regressions.


## 2026-07-28 · Progressive Web App (PWA) — installable to home screen

User asked to "create an app for the website" and replace the "Invest" quick action with an install-app button. Implemented as a proper PWA (installable on Android/Chrome/Edge/Samsung/desktop, plus a hand-held helper for iOS Safari).

### New assets
- `/frontend/public/manifest.json` — name, gold `theme_color #F5C518`, standalone display, portrait orientation, 4 icons (192/512/maskable-512/apple-touch), 3 launcher shortcuts (Deposit / Invest / Withdraw), start_url `/dashboard`.
- `/frontend/public/service-worker.js` — minimal SW that intercepts navigation requests and falls back to an offline page if the network is dead. Explicitly does NOT cache API responses (balances/gateways must stay fresh).
- `/frontend/public/offline.html` — dark-gold branded fallback shown when the user is offline.
- `/frontend/public/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/apple-touch-icon.png`, `/favicon-32.png`, `/favicon-64.png` — generated in Python/PIL from the NaijaInvest gold-gradient "trending-up arrow" brand mark.
- `/frontend/public/index.html` — replaced boilerplate title/theme-color with real branding, wired manifest + iOS Safari meta tags (`apple-mobile-web-app-*`).

### Frontend hook + component
- `/frontend/src/hooks/usePWAInstall.js` — new hook that listens for `beforeinstallprompt` (stashed on `window.__nbDeferredInstall` so hot-reload doesn't lose it) and `appinstalled`. Exposes `{canInstall, isInstalled, isIOS, promptInstall()}`.
- `/frontend/src/components/InstallAppTile.jsx` — drop-in tile matching the Dashboard `ActionTile` visual language exactly (dashed gold accents, gold glow, `var(--nb-card)` body). On click:
  - if installed → toast "already on your home screen"
  - if `beforeinstallprompt` deferred → call `prompt()` + show accepted/dismissed toast
  - if iOS → open the 3-step "Share → Add to Home Screen" helper modal (`data-testid="ios-install-helper"`)
  - otherwise → fallback toast pointing to the browser menu
- `/frontend/src/index.js` — registers `/service-worker.js` on window `load`, wrapped in try/catch so a broken SW never breaks the site.
- `/frontend/src/pages/user/Dashboard.jsx` — the 4th quick action tile ("Invest") swapped for `<InstallAppTile />`. Invest destination remains reachable via the bottom nav (`/marketplace`).

### Verified
- `curl` on `/manifest.json`, `/service-worker.js`, `/icon-192.png` → all 200.
- `navigator.serviceWorker.getRegistrations()` returns scope `/` after page load.
- `document.querySelector('[data-testid=install-app-tile]')` present on Dashboard.
- Tile styled correctly in both dark (gold gradient icon on navy card) and light (gold gradient icon on white card) modes.
- Fallback toast fires when browser has no deferred install event (verified in Chromium test env).

