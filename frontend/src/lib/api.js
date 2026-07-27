import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const API = `${BACKEND_URL}/api`;

/**
 * Per-tab impersonation helpers.
 *
 * When an admin clicks "Log in as user" on `/admin/users/<uid>`, we mint an
 * access token for that user and open the impersonated dashboard in a **new
 * browser tab**. The token is stored in that tab's `sessionStorage` (which is
 * NOT shared across tabs), then sent on every API call as an `Authorization:
 * Bearer <token>` header while `withCredentials` is forced to `false` for that
 * request so the admin's own auth cookies are never sent.
 *
 * Net effect: the impersonation tab acts as the target user; the admin's
 * original tab remains logged in as admin.
 */
export const IMP_TOKEN_KEY = "impersonation_token";
export const IMP_ADMIN_ID_KEY = "impersonation_admin_id";
export const IMP_USER_KEY = "impersonation_user_summary";
export const isImpersonatingTab = () =>
  typeof window !== "undefined" && !!window.sessionStorage.getItem(IMP_TOKEN_KEY);

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (isImpersonatingTab()) {
    const token = window.sessionStorage.getItem(IMP_TOKEN_KEY);
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
    // Do NOT send the admin's cookies from this tab — force pure Bearer auth.
    config.withCredentials = false;
  }
  return config;
});

export function formatNaira(n) {
  const v = Number(n || 0);
  return "₦" + v.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
