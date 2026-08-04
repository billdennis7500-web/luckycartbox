import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/sonner";

import Login from "@/pages/Login";
import AdminLogin from "@/pages/AdminLogin";
import Register from "@/pages/Register";

import UserLayout from "@/pages/user/UserLayout";
import Dashboard from "@/pages/user/Dashboard";
import Marketplace from "@/pages/user/Marketplace";
import Deposit from "@/pages/user/Deposit";
import DepositHistory from "@/pages/user/DepositHistory";
import Withdraw from "@/pages/user/Withdraw";
import WithdrawHistory from "@/pages/user/WithdrawHistory";
import Referrals from "@/pages/user/Referrals";
import Rewards from "@/pages/user/Rewards";
import CouponHistory from "@/pages/user/CouponHistory";
import Coupon from "@/pages/user/Coupon";
import Transactions from "@/pages/user/Transactions";
import Profile from "@/pages/user/Profile";
import BindAccount from "@/pages/user/BindAccount";
import Investments from "@/pages/user/Investments";
import CustomerService from "@/pages/user/CustomerService";
import Level from "@/pages/user/Level";
import About from "@/pages/user/About";
import ChangePassword from "@/pages/user/ChangePassword";
import ImpersonateBootstrap from "@/pages/ImpersonateBootstrap";

import AdminLayout from "@/pages/admin/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminUserDetail from "@/pages/admin/AdminUserDetail";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminDeposits from "@/pages/admin/AdminDeposits";
import AdminWithdrawals from "@/pages/admin/AdminWithdrawals";
import AdminReferrals from "@/pages/admin/AdminReferrals";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminAccounts from "@/pages/admin/AdminAccounts";
import AdminSettings from "@/pages/admin/AdminSettings";

function RootRedirect() {
  const { user } = useAuth();
  if (user === null) return null; // still loading /auth/me
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--nb-card)",
              border: "1px solid var(--nb-border)",
              color: "var(--nb-text)",
            },
          }}
        />
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/register" element={<Register />} />
          <Route path="/impersonate" element={<ImpersonateBootstrap />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <UserLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="marketplace" element={<Marketplace />} />
            <Route path="investments" element={<Investments />} />
            <Route path="deposit" element={<Deposit />} />
            <Route path="deposit-history" element={<DepositHistory />} />
            <Route path="withdraw" element={<Withdraw />} />
            <Route path="withdraw-history" element={<WithdrawHistory />} />
            <Route path="bank-account" element={<BindAccount />} />
            <Route path="referrals" element={<Referrals />} />
            <Route path="rewards" element={<Rewards />} />
            <Route path="coupon-history" element={<CouponHistory />} />
            <Route path="coupon" element={<Coupon />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="customer-service" element={<CustomerService />} />
            <Route path="level" element={<Level />} />
            <Route path="about" element={<About />} />
            <Route path="change-password" element={<ChangePassword />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:uid" element={<AdminUserDetail />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="deposits" element={<AdminDeposits />} />
            <Route path="withdrawals" element={<AdminWithdrawals />} />
            <Route path="referrals" element={<AdminReferrals />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="accounts" element={<AdminAccounts />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
