# Auth Testing Playbook — NaijaInvest

- Users register/login with a Nigerian phone number (`+234XXXXXXXXXX` or `0XXXXXXXXXX`, auto-normalized) + password.
- Admin is seeded automatically on startup from `.env` (`ADMIN_PHONE`, `ADMIN_PASSWORD`).
- Auth is JWT via httpOnly cookies (`access_token`, `refresh_token`). All authenticated frontend calls use `withCredentials: true`.

## Curl smoke test
```
curl -c cookies.txt -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+2348000000000","password":"Admin@12345"}'
curl -b cookies.txt http://localhost:8001/api/auth/me
```
Expected: login returns `{user, access_token}` with 200 and sets cookies; `/me` returns the admin user.

## Registration flow
- New users receive a welcome bonus (default ₦500) credited to `bonus_balance` + transaction record `welcome_bonus`.
- `referral_code` in payload attaches `referred_by`. Referral commissions are credited only when the referred user *invests*.
