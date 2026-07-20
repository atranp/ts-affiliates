"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import { QueryProvider } from "@/components/QueryProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <QueryProvider>
      <AuthProvider>
        {isLogin ? (
          <main className="min-h-screen px-4">{children}</main>
        ) : (
          children
        )}
        <Toaster richColors closeButton position="top-right" />
      </AuthProvider>
    </QueryProvider>
  );
}
