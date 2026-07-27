import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IMP_TOKEN_KEY, IMP_ADMIN_ID_KEY, IMP_USER_KEY } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";

/**
 * ImpersonateBootstrap
 *
 * Landing page for the impersonation new-tab flow.
 *
 * The parent admin tab opens `/impersonate#token=<jwt>&admin_id=<oid>&user=<uid>`
 * in a new browser tab via `window.open(url, "_blank")`. This component reads
 * those params from the URL fragment (which is NOT sent to the server or
 * captured in server access logs), stashes them in `sessionStorage` (tab-scoped
 * — never leaks to other tabs), clears the fragment, then re-fetches `/auth/me`
 * so the AuthContext resolves to the impersonated user.
 */
export default function ImpersonateBootstrap() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // Guard against React StrictMode double-invoke
    ranRef.current = true;

    // Prefer sessionStorage if a previous effect run already parsed the hash.
    const existing = window.sessionStorage.getItem(IMP_TOKEN_KEY);
    let token = existing;

    if (!token) {
      const raw = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(raw);
      token = params.get("token");
      if (token) {
        window.sessionStorage.setItem(IMP_TOKEN_KEY, token);
        const adminId = params.get("admin_id");
        if (adminId) window.sessionStorage.setItem(IMP_ADMIN_ID_KEY, adminId);
        const userSummary = params.get("user");
        if (userSummary) window.sessionStorage.setItem(IMP_USER_KEY, userSummary);
        // Clear the fragment so the JWT never sits in the address bar / history.
        window.history.replaceState(null, "", "/impersonate");
      }
    }

    if (!token) {
      setError("Missing impersonation token.");
      return;
    }

    (async () => {
      const u = await refresh();
      if (!u) {
        setError("Impersonation token was rejected. Ask your admin to try again.");
        return;
      }
      nav("/dashboard", { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#050914] text-white grid place-items-center px-6">
      <div className="max-w-sm w-full rounded-2xl border border-[#1A2B44] bg-[#0B1524] p-6 text-center">
        {error ? (
          <>
            <ShieldAlert className="w-8 h-8 text-[#EF4444] mx-auto" />
            <div className="mt-3 font-display font-700">Impersonation failed</div>
            <div className="mt-1 text-xs text-[#94A3B8]">{error}</div>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 text-[#0055FF] animate-spin mx-auto" />
            <div className="mt-3 font-display font-700">Switching to user view…</div>
            <div className="mt-1 text-xs text-[#94A3B8]">Loading their dashboard in this tab.</div>
          </>
        )}
      </div>
    </div>
  );
}
