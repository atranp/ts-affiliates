"use client";

import { FlaskConical } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { isMockAdminUser } from "@/lib/mock/admin-auth";

export function AdminMockBanner() {
  const { user } = useAuth();

  if (!isMockAdminUser(user)) return null;

  return (
    <div className="border-b border-violet-300/80 bg-violet-50 px-3 py-2 text-center text-[11px] leading-snug text-pretty text-violet-950 sm:px-4 sm:text-sm">
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-medium">
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
        Admin mock mode — fixture data only, no DB or SliceWP. Run without{" "}
        <code className="rounded bg-violet-100/80 px-1 py-0.5 font-mono text-[11px]">
          ADMIN_MOCK_DATA
        </code>{" "}
        for real auth.
      </span>
    </div>
  );
}
