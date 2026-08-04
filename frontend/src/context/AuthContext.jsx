import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = anonymous, object = user
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch (e) {
      setUser(false);
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (phone, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { phone, password });
      setUser(data.user);
      return data.user;
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || e.message;
      setError(msg);
      throw new Error(msg);
    }
  };

  const register = async (payload) => {
    setError("");
    try {
      const { data } = await api.post("/auth/register", payload);
      setUser(data.user);
      // Return the full response so callers can access welcome_bonus_credited
      // (the authoritative amount the backend actually applied to the wallet).
      return { user: data.user, welcome_bonus_credited: data.welcome_bonus_credited };
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || e.message;
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("impersonation_admin_id");
    setUser(false);
  };

  // ----- Impersonation ------------------------------------------------------
  // Admin backs up its own user_id to localStorage before switching to the target user.
  // The target user's cookies are set server-side by /admin/users/{uid}/impersonate.
  const impersonate = async (targetUserId) => {
    // Guarded: current user MUST be an admin
    if (!user || user.role !== "admin") throw new Error("Only admins can impersonate");
    localStorage.setItem("impersonation_admin_id", user.id);
    const { data } = await api.post(`/admin/users/${targetUserId}/impersonate`);
    setUser(data.user);
    return data.user;
  };

  const stopImpersonation = async () => {
    const adminId = localStorage.getItem("impersonation_admin_id");
    if (!adminId) return null;
    try {
      const { data } = await api.post(`/admin/impersonate/stop`, null, { params: { admin_id: adminId } });
      setUser(data.user);
      return data.user;
    } finally {
      localStorage.removeItem("impersonation_admin_id");
    }
  };

  const isImpersonating = () =>
    typeof window !== "undefined" && !!localStorage.getItem("impersonation_admin_id");

  return (
    <AuthContext.Provider value={{
      user, setUser, error, login, register, logout, refresh,
      impersonate, stopImpersonation, isImpersonating,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
