"use client";

import Link from "next/link";
import { EmptyState } from "@/components/admin/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminAffiliateDetail } from "@/lib/admin/types";

export function AffiliateRulesTab({
  affiliateId,
  dealRules,
}: {
  affiliateId: string;
  dealRules: AdminAffiliateDetail["dealRules"];
}) {
  const ruleCount = dealRules.asSponsor.length + dealRules.asRecruit.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deal rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {ruleCount === 0 ? (
          <EmptyState
            title="No deal rules"
            action={
              <Button asChild>
                <Link href={`/admin/deal-rules?sponsorId=${affiliateId}`}>
                  Add deal rule
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            {dealRules.asSponsor.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Earns overrides from</p>
                <RulesTable rules={dealRules.asSponsor} role="sponsor" />
              </div>
            )}
            {dealRules.asRecruit.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Generates overrides for</p>
                <RulesTable rules={dealRules.asRecruit} role="recruit" />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RulesTable({
  rules,
  role,
}: {
  rules: AdminAffiliateDetail["dealRules"]["asSponsor"];
  role: "sponsor" | "recruit";
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="ts-table-header hover:bg-muted">
          <TableHead>Rule</TableHead>
          <TableHead>{role === "sponsor" ? "Recruit" : "Sponsor"}</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead>Milestone</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell className="font-medium">{rule.name}</TableCell>
            <TableCell>
              {rule.counterparty ? (
                <Link
                  href={`/admin/affiliates/${rule.counterparty.id}`}
                  className="text-primary hover:underline"
                >
                  {rule.counterparty.displayName ?? rule.counterparty.email}
                </Link>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{rule.ratePercent}%</TableCell>
            <TableCell>
              {rule.milestoneRevenueThreshold
                ? `$${Number(rule.milestoneRevenueThreshold).toLocaleString()}`
                : "—"}
            </TableCell>
            <TableCell>
              <Badge variant={rule.active ? "paid" : "secondary"}>
                {rule.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
