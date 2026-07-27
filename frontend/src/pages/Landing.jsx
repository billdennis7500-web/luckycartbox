import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck, TrendingUp, Users, Gift, Wallet, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-[#020813] text-[#F8FAFC] grain">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#020813]/70 border-b border-[#1A2B44]">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-logo">
            <div className="w-8 h-8 rounded-md bg-[#0055FF] grid place-items-center glow-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">NaijaInvest</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-[#94A3B8]">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#plans" className="hover:text-white transition-colors">Plans</a>
            <a href="#referral" className="hover:text-white transition-colors">Referral</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" data-testid="nav-login-link">
              <Button variant="ghost" className="text-[#94A3B8] hover:text-white hover:bg-[#121E30]">Sign in</Button>
            </Link>
            <Link to="/register" data-testid="nav-register-link">
              <Button className="bg-[#0055FF] hover:bg-[#3377FF] text-white glow-primary rounded-md">
                Start earning <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[540px] h-[540px] rounded-full bg-[#0055FF]/20 blur-[120px]" />
          <div className="absolute -bottom-40 -left-40 w-[540px] h-[540px] rounded-full bg-[#0055FF]/10 blur-[140px]" />
        </div>
        <div className="max-w-7xl mx-auto px-6 py-24 lg:py-32 grid lg:grid-cols-12 gap-12 items-center relative">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0B1524] border border-[#1A2B44] text-xs text-[#94A3B8] mb-6">
              <Sparkles className="w-3 h-3 text-[#0055FF]" /> ₦500 welcome bonus on sign-up
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-800 tracking-tight leading-[1.05]">
              Grow your naira. <span className="text-[#0055FF]">Daily.</span>
              <br />
              Right from your phone.
            </h1>
            <p className="mt-6 text-lg text-[#94A3B8] max-w-xl leading-relaxed">
              Nigeria's modern investment platform. Pick a plan, watch profit drop every 24 hours,
              refer friends across 3 generations, and withdraw straight to your bank.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                data-testid="hero-cta-signup"
                onClick={() => nav("/register")}
                className="bg-[#0055FF] hover:bg-[#3377FF] text-white text-base h-12 px-6 rounded-md glow-primary-lg"
              >
                Create free account <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                data-testid="hero-cta-login"
                variant="outline"
                onClick={() => nav("/login")}
                className="h-12 px-6 rounded-md border-[#1A2B44] bg-transparent hover:bg-[#121E30] text-white"
              >
                I already have an account
              </Button>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-6 max-w-lg">
              {[
                ["₦2.4B+", "Paid to investors"],
                ["18K+", "Active investors"],
                ["24h", "Profit drops"],
              ].map(([n, l]) => (
                <div key={l}>
                  <div className="font-display text-2xl font-800 tabular">{n}</div>
                  <div className="text-xs uppercase tracking-widest text-[#94A3B8] mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl border border-[#1A2B44] bg-[#0B1524] p-6 glow-primary-lg">
              <img
                src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MjJ8MHwxfHNlYXJjaHwxfHxpbnZlc3RtZW50JTIwZ3Jvd3RoJTIwY2hhcnR8ZW58MHx8fHwxNzg1MTQ3NDM5fDA&ixlib=rb-4.1.0&q=85"
                alt="Investment growth"
                className="w-full h-56 object-cover rounded-lg border border-[#1A2B44]"
              />
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-[#1A2B44] p-4">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Silver Plan</div>
                  <div className="mt-2 font-display text-xl font-800 tabular">6% / day</div>
                  <div className="text-xs text-[#10B981] mt-1">30 days · ₦20,000 min</div>
                </div>
                <div className="rounded-lg border border-[#0055FF] bg-[#0055FF]/10 p-4">
                  <div className="text-xs text-[#0055FF] uppercase tracking-wider">Gold Plan</div>
                  <div className="mt-2 font-display text-xl font-800 tabular">7.5% / day</div>
                  <div className="text-xs text-[#10B981] mt-1">45 days · elite tier</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-[#1A2B44]">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: TrendingUp, title: "Daily profit drops", body: "Auto-credit every 24 hours for the plan duration." },
            { icon: Users, title: "3-gen referral", body: "Earn on your team's team's team. 20% / 5% / 2% by default." },
            { icon: Gift, title: "Coupon bonuses", body: "Redeem promo codes for instant wallet credit." },
            { icon: ShieldCheck, title: "Bank-grade auth", body: "Phone login, encrypted passwords, admin approvals." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-[#1A2B44] bg-[#0B1524] p-6 card-hover">
              <div className="w-10 h-10 rounded-md bg-[#0055FF]/15 border border-[#0055FF]/30 grid place-items-center">
                <f.icon className="w-5 h-5 text-[#0055FF]" />
              </div>
              <h3 className="mt-4 font-display font-600 text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Referral illustration */}
      <section id="referral" className="border-t border-[#1A2B44]">
        <div className="max-w-7xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="font-display text-3xl lg:text-4xl font-800 tracking-tight">
              Refer once. Earn three times.
            </h2>
            <p className="mt-4 text-[#94A3B8] leading-relaxed max-w-lg">
              Every person you bring — and every person they bring, and so on — pays into your wallet
              when they invest. Commissions are configurable by the admin.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
              <div className="rounded-lg border border-[#0055FF] bg-[#0055FF]/10 p-4">
                <div className="text-xs text-[#0055FF] uppercase tracking-wider">Gen 1</div>
                <div className="font-display text-2xl font-800 tabular mt-2">20%</div>
              </div>
              <div className="rounded-lg border border-[#1A2B44] bg-[#0B1524] p-4">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Gen 2</div>
                <div className="font-display text-2xl font-800 tabular mt-2">5%</div>
              </div>
              <div className="rounded-lg border border-[#1A2B44] bg-[#0B1524] p-4">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Gen 3</div>
                <div className="font-display text-2xl font-800 tabular mt-2">2%</div>
              </div>
            </div>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-[#1A2B44]">
            <img
              src="https://images.unsplash.com/photo-1723221907187-3e88c1d74b99?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzZ8MHwxfHNlYXJjaHwzfHxuaWdlcmlhbiUyMGJ1c2luZXNzJTIwcGVvcGxlJTIwc21pbGluZ3xlbnwwfHx8fDE3ODUxNDc0Mzh8MA&ixlib=rb-4.1.0&q=85"
              alt="Nigerian investor"
              className="w-full h-[420px] object-cover"
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="plans" className="border-t border-[#1A2B44]">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          <Wallet className="w-10 h-10 text-[#0055FF] mx-auto" />
          <h2 className="mt-6 font-display text-3xl lg:text-5xl font-800 tracking-tight">
            Your wallet is 30 seconds away.
          </h2>
          <p className="mt-4 text-[#94A3B8] max-w-xl mx-auto">
            Sign up with your phone number, claim your ₦500 welcome bonus, pick a plan, and start earning today.
          </p>
          <Button
            data-testid="final-cta-signup"
            onClick={() => nav("/register")}
            className="mt-8 bg-[#0055FF] hover:bg-[#3377FF] text-white h-12 px-8 rounded-md glow-primary-lg"
          >
            Get started free <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-[#1A2B44] py-8 text-center text-sm text-[#94A3B8]">
        © 2026 NaijaInvest. All rights reserved.
      </footer>
    </div>
  );
}
