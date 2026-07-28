"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { adminMutate } from "@/hooks/use-admin-query";

export function ImpersonationBanner() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="border-b border-warning/30 bg-warning/10 px-3 py-2 sm:px-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground">
          Viewing as{" "}
          <span className="font-semibold">{user.affiliateName ?? user.name}</span>
          {user.realUserName ? (
            <span className="text-muted-foreground">
              {" "}
              (signed in as {user.realUserName})
            </span>
          ) : null}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={handleExit}
        >
          <EyeOff className="h-4 w-4" />
          {loading ? "Exiting…" : "Exit view"}
        </Button>
      </div>
    </div>
  );
}
