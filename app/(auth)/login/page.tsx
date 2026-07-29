"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const blockMessages: Record<string, string> = {
  NO_PROFILE: "Your account is not set up. Contact an administrator.",
  PORTAL_DISABLED: "Portal access has been disabled. Contact an administrator.",
  AFFILIATE_INACTIVE:
    "Your affiliate account is not active. Contact an administrator.",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setLoading(false);
      setError("Invalid email or password");
      return;
    }

    const meRes = await fetch("/api/me");
    const me = meRes.ok
      ? await meRes.json()
      : ((await meRes.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        });

    if (!meRes.ok) {
      await supabase.auth.signOut();
      setLoading(false);
      setError(
        (me as { error?: string }).error ??
          blockMessages[(me as { code?: string }).code ?? ""] ??
          "Unable to sign in"
      );
      return;
    }

    await supabase.auth.refreshSession();

    if (me?.mustChangePassword) {
      router.push("/account/change-password");
    } else {
      router.push(me?.role === "ADMIN" ? "/admin" : "/dashboard");
    }
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 shadow-xs">
        <div className="space-y-2 text-center">
          <div className="mb-1 flex justify-center">
            <BrandMark className="h-12 w-12 text-xl" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">
            TRUE SCIENCES
          </p>
          <h1 className="text-xl font-bold tracking-tight text-brand-dark">
            Partner Portal Sign In
          </h1>
          <p className="text-xs text-muted-foreground">
            Access your sales commissions, team earnings, and payout history.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg pl-9"
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold">
              Password
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg pl-9"
                required
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full rounded-lg border border-brand-dark py-2.5 text-xs font-semibold shadow-sm"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In to Partner Portal"}
            {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </form>

        <div className="border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
          <p>True Sciences Research Products · Partner Network</p>
          <p className="mt-0.5 text-[10px] italic text-brand">
            Premium Research · Simple Pricing
          </p>
        </div>
      </div>
    </div>
  );
}
