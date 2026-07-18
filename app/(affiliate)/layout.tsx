import { AffiliateShell } from "@/components/layout/AffiliateShell";

export default function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AffiliateShell>{children}</AffiliateShell>;
}
