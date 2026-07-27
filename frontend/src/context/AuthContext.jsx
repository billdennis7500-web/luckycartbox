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
      return data.user;
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || e.message;
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, error, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
