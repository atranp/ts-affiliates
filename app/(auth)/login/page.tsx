"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NEXT_PARAM, safeNextPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

const blockMessages: Record<string, string> = {
  NO_PROFILE: "Your account is not set up. Contact an administrator.",
  PORTAL_DISABLED: "Portal access has been disabled. Contact an administrator.",
  AFFILIATE_INACTIVE:
    "Your affiliate account is not active. Contact an administrator.",
};

const fieldClassName =
  "h-11 rounded-lg text-base sm:h-9 sm:text-sm";

function LoginSkeleton() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div
        className="w-full max-w-md animate-pulse space-y-6 rounded-xl border border-border bg-card p-6 shadow-xs sm:p-8"
        aria-hidden
      >
        <div className="space-y-3 text-center">
          <div className="mx-auto h-3 w-28 rounded bg-muted" />
          <div className="mx-auto h-6 w-56 rounded bg-muted" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-11 rounded-lg bg-muted" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-11 rounded-lg bg-muted" />
          </div>
          <div className="h-11 rounded-lg bg-muted" />
        </div>
        <div className="border-t border-border pt-4">
          <div className="mx-auto h-8 w-full max-w-xs rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !loading;

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      document.getElementById("email")?.focus();
    }
  }, []);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (error) setError("");
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (error) setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");

    let signedIn = false;

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError("Invalid email or password");
        return;
      }

      let meRes: Response;
      try {
        meRes = await fetch("/api/me");
      } catch {
        await supabase.auth.signOut();
        setError(
          "Unable to reach the server. Check your connection and try again."
        );
        return;
      }

      const me = meRes.ok
        ? await meRes.json()
        : ((await meRes.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          });

      if (!meRes.ok) {
        await supabase.auth.signOut();
        setError(
          (me as { error?: string }).error ??
            blockMessages[(me as { code?: string }).code ?? ""] ??
            "Unable to sign in"
        );
        return;
      }

      await supabase.auth.refreshSession();
      signedIn = true;

      if (me?.mustChangePassword) {
        router.push("/account/change-password");
      } else {
        const next = safeNextPath(searchParams.get(NEXT_PARAM));
        router.push(next ?? (me?.role === "ADMIN" ? "/admin" : "/dashboard"));
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      if (!signedIn) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <main className="w-full max-w-md">
        <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-xs sm:p-8">
          <div className="space-y-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand">
              TRUE SCIENCES
            </p>
            <h1
              id="login-heading"
              className="text-xl font-bold tracking-tight text-brand-dark sm:text-2xl"
            >
              Ambassador Portal Sign In
            </h1>
          </div>

          {/*
            method="post" is a safety net: if this form is submitted before
            hydration, POST keeps credentials out of the URL and history.
          */}
          <form
            onSubmit={handleSubmit}
            method="post"
            className="space-y-4"
            aria-labelledby="login-heading"
            noValidate={false}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold sm:text-sm">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  enterKeyHint="next"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  className={cn(fieldClassName, "pl-9")}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={loading}
                  aria-invalid={!!error}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-semibold sm:text-sm"
              >
                Password
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  enterKeyHint="go"
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  className={cn(fieldClassName, "pl-9 pr-12")}
                  autoComplete="current-password"
                  disabled={loading}
                  aria-invalid={!!error}
                  aria-describedby={error ? errorId : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  disabled={loading}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
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
                ref={errorRef}
                id={errorId}
                role="alert"
                tabIndex={-1}
                className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-snug text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="h-11 w-full rounded-lg border border-brand-dark py-2.5 text-sm font-semibold shadow-sm sm:h-9 sm:text-xs"
              disabled={!canSubmit}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In to Ambassador Portal
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </Button>
          </form>

          <div className="border-t border-border pt-4 text-center text-xs leading-relaxed text-muted-foreground sm:text-[11px]">
            <p>
              Trouble signing in? Contact your True Sciences administrator to
              reset your password.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
