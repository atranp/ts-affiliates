"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AffiliateShell } from "@/components/layout/AffiliateShell";
import { OnboardingShell } from "@/components/layout/OnboardingShell";

type AffiliateLayoutClientProps = {
  children: React.ReactNode;
};

export function AffiliateLayoutClient({
  children,
}: AffiliateLayoutClientProps) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  const onboardingChangePassword =
    pathname === "/account/change-password" &&
    (loading || user?.mustChangePassword);

  if (onboardingChangePassword) {
    return <OnboardingShell>{children}</OnboardingShell>;
  }

  return <AffiliateShell>{children}</AffiliateShell>;
}
