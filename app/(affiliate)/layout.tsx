import { AffiliateLayoutClient } from "@/components/layout/AffiliateLayoutClient";

export default function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AffiliateLayoutClient>{children}</AffiliateLayoutClient>;
}
