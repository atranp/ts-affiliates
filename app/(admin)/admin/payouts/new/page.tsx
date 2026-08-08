"use client";

import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { CreatePayoutPanel } from "@/components/payouts/CreatePayoutPanel";
import { Button } from "@/components/ui/button";

export default function NewPayoutPage() {
  return (
    <div className="ts-workspace gap-4">
      <div className="shrink-0">
        <PageHeader
          title="New payout"
          description="Pay an ambassador everything they are owed up to right now."
          actions={
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/payouts">
                <ArrowLeft className="mr-2 h-4 w-4" />
                All payouts
              </Link>
            </Button>
          }
        />
      </div>

      <div className="ts-panel flex min-h-0 flex-1 flex-col">
        <div className="ts-panel-header shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PenLine className="h-4 w-4" />
            </div>
            <div>
              <h2 className="ts-section-title">Record payout</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pick the ambassador, pick what to cover, pay it
              </p>
            </div>
          </div>
        </div>
        <div className="ts-panel-body ts-panel-scroll">
          <CreatePayoutPanel />
        </div>
      </div>
    </div>
  );
}
