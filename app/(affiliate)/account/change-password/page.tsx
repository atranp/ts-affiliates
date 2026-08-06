"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { useAuth } from "@/components/AuthProvider";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { cn } from "@/lib/utils";

export default function ChangePasswordPage() {
  const { user, loading } = useAuth();
  const copy = AFFILIATE_COPY.account.changePassword;
  const required = !!user?.mustChangePassword;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="mb-6 shrink-0">
        {!required && !loading && (
          <Link
            href="/dashboard"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to dashboard
          </Link>
        )}

        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 id="change-password-heading" className="page-title text-xl sm:text-2xl">
              {required ? copy.requiredTitle : copy.title}
            </h1>
            <p className="page-description mt-1">
              {required ? copy.requiredDescription : copy.description}
            </p>
          </div>
        </div>
      </header>

      {required && (
        <div
          className={cn(
            "mb-6 flex gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3",
            "text-sm leading-snug text-foreground"
          )}
          role="status"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden
          />
          <p>{copy.requiredBanner}</p>
        </div>
      )}

      <div className="ts-panel">
        <div className="ts-panel-header">
          <p className="text-sm font-semibold text-foreground">
            {copy.panelTitle}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {copy.panelDescription}
          </p>
        </div>
        <div className="ts-panel-body">
          {!loading ? (
            <ChangePasswordForm required={required} />
          ) : (
            <div
              className="space-y-4 animate-pulse"
              aria-busy="true"
              aria-label="Loading"
            >
              <div className="space-y-2">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-11 rounded-lg bg-muted sm:h-9" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-28 rounded bg-muted" />
                <div className="h-11 rounded-lg bg-muted sm:h-9" />
              </div>
              <div className="h-16 rounded-lg bg-muted" />
              <div className="h-11 rounded-lg bg-muted sm:h-9" />
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground sm:text-left">
        {copy.footer}
      </p>
    </div>
  );
}
