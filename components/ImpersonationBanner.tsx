"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { adminMutate } from "@/hooks/use-admin-query";

const IMPERSONATION_OFFSET_VAR = "--impersonation-offset";

function setImpersonationOffset(height: number) {
  document.documentElement.style.setProperty(
    IMPERSONATION_OFFSET_VAR,
    height > 0 ? `${height}px` : "0px"
  );
}

export function ImpersonationBanner() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const bannerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.impersonating) {
      setImpersonationOffset(0);
      return;
    }

    const el = bannerRef.current;
    if (!el) return;

    function syncOffset() {
      setImpersonationOffset(el!.offsetHeight);
    }

    syncOffset();
    const observer = new ResizeObserver(syncOffset);
    observer.observe(el);

    return () => {
      observer.disconnect();
      setImpersonationOffset(0);
    };
  }, [user?.impersonating]);

  if (!user?.impersonating) return null;

  async function handleExit() {
    setLoading(true);
    try {
      await adminMutate<{ redirectTo: string }>("/api/admin/impersonate", {
        method: "DELETE",
      });
      await refresh();
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const displayName = user.affiliateName ?? user.name;

  return (
    <div
      ref={bannerRef}
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 border-b border-amber-600/30 bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-950"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Impersonation Active: Viewing Partner Portal as{" "}
          <strong className="underline">{displayName}</strong>
          {user.email ? ` (${user.email})` : ""}
        </span>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={handleExit}
        className="flex shrink-0 items-center gap-1 rounded-md bg-amber-900 px-3 py-1 text-[11px] font-bold text-amber-100 shadow-xs transition-colors hover:bg-amber-950 disabled:opacity-50"
      >
        {loading ? "Exiting…" : "Exit Impersonation"}
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
