"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NEXT_PARAM, safeNextPath } from "@/lib/routes";

const blockMessages: Record<string, string> = {
  NO_PROFILE: "Your account is not set up. Contact an administrator.",
  PORTAL_DISABLED: "Portal access has been disabled. Contact an administrator.",
  AFFILIATE_INACTIVE:
    "Your affiliate account is not active. Contact an administrator.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
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

    // Leave the button in its loading state: this component stays mounted
    // until the route transition finishes, and resetting it here makes the
    // form look idle mid-navigation and invites a second submit.
    if (me?.mustChangePassword) {
      router.push("/account/change-password");
    } else {
      const next = safeNextPath(searchParams.get(NEXT_PARAM));
      router.push(next ?? (me?.role === "ADMIN" ? "/admin" : "/dashboard"));
    }
    router.refresh();
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

        {/*
          method="post" is a safety net, not a real endpoint: if this form is
          ever submitted before hydration attaches the handler below, a default
          GET would put the password in the URL, browser history, and access
          logs. POST keeps the credentials in the request body.
        */}
        <form onSubmit={handleSubmit} method="post" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg pl-9"
                placeholder="name@company.com"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
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
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg pl-9 pr-10"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

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
          <p>
            Trouble signing in? Contact your True Sciences administrator to
            reset your password.
          </p>
          <p className="mt-2">True Sciences Research Products · Partner Network</p>
          <p className="mt-0.5 text-[10px] italic text-brand">
            Premium Research · Simple Pricing
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
