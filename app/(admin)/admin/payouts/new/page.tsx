"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { CreatePayoutPanel } from "@/components/payouts/CreatePayoutPanel";
import { Button } from "@/components/ui/button";

export default function NewPayoutPage() {
  return (
    <div className="ts-workspace gap-4">
      <div className="ts-page-header shrink-0 max-sm:px-0.5">
        <PageHeader
          title="New payout"
          description="Pay an ambassador everything they are owed up to right now."
          actions={
            <Button size="sm" variant="outline" className="rounded-lg" asChild>
              <Link href="/admin/payouts">
                <ArrowLeft className="mr-2 h-4 w-4" />
                All payouts
              </Link>
            </Button>
          }
        />
      </div>

      <CreatePayoutPanel />
    </div>
  );
}
