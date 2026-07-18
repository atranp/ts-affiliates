"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminQuery, adminMutate } from "@/hooks/use-admin-query";

import type { PaginatedAffiliates } from "@/lib/admin/types";

type DealRule = {
  id: string;
  name: string;
  type: string;
  ratePercent: string;
  basis: string;
  active: boolean;
  sponsorAffiliate: { displayName: string | null; email: string };
  sourceAffiliate: { displayName: string | null; email: string } | null;
};

export default function AdminDealRulesPage() {
  const {
    data: affiliates,
    isLoading: affiliatesLoading,
    error: affiliatesError,
    mutate: mutateAffiliates,
  } = useAdminQuery<PaginatedAffiliates>("/api/admin/affiliates?pageSize=500");
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    mutate: mutateRules,
  } = useAdminQuery<DealRule[]>("/api/admin/deal-rules");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sponsorAffiliateId: "",
    sourceAffiliateId: "",
    ratePercent: "10",
  });

  const affiliateList = affiliates?.items ?? [];

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = await adminMutate<DealRule>("/api/admin/deal-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: "REVENUE_OVERRIDE",
          sponsorAffiliateId: form.sponsorAffiliateId,
          sourceAffiliateId: form.sourceAffiliateId,
          ratePercent: Number(form.ratePercent),
          basis: "ORDER_REVENUE",
        }),
      });
      toast.success(`Created deal rule: ${body.name}`);
      setForm({
        name: "",
        sponsorAffiliateId: "",
        sourceAffiliateId: "",
        ratePercent: "10",
      });
      await mutateRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = affiliatesLoading || rulesLoading;
  const error = affiliatesError ?? rulesError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deal Rules"
        description="Custom override payouts — e.g. sponsor earns % of recruit revenue"
      />

      {error && (
        <ErrorState
          message={error.message}
          onRetry={() => {
            mutateAffiliates();
            mutateRules();
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create rule</CardTitle>
          <CardDescription>
            Overrides are applied on each commission sync
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createRule} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Rule name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Trin 10% of Blair revenue"
                required
                disabled={submitting || affiliatesLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sponsor">Sponsor (gets paid)</Label>
              <select
                id="sponsor"
                className="select-field"
                value={form.sponsorAffiliateId}
                onChange={(e) =>
                  setForm({ ...form, sponsorAffiliateId: e.target.value })
                }
                required
                disabled={submitting || affiliatesLoading}
              >
                <option value="">Select affiliate</option>
                {affiliateList.map((affiliate) => (
                  <option key={affiliate.id} value={affiliate.id}>
                    {affiliate.displayName ?? affiliate.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Recruit (generates override)</Label>
              <select
                id="source"
                className="select-field"
                value={form.sourceAffiliateId}
                onChange={(e) =>
                  setForm({ ...form, sourceAffiliateId: e.target.value })
                }
                required
                disabled={submitting || affiliatesLoading}
              >
                <option value="">Select affiliate</option>
                {affiliateList.map((affiliate) => (
                  <option key={affiliate.id} value={affiliate.id}>
                    {affiliate.displayName ?? affiliate.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate">Rate (% of order revenue)</Label>
              <Input
                id="rate"
                type="number"
                min="0"
                step="0.01"
                value={form.ratePercent}
                onChange={(e) =>
                  setForm({ ...form, ratePercent: e.target.value })
                }
                required
                disabled={submitting}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={submitting || affiliatesLoading}>
                {submitting ? "Creating..." : "Create rule"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active rules</CardTitle>
          <CardDescription>
            {rules ? `${rules.length} rule${rules.length === 1 ? "" : "s"}` : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <TableSkeleton columns={5} />}
          {!isLoading && rules?.length === 0 && (
            <EmptyState
              title="No deal rules yet"
              description="Create a rule above, then run sync to generate override ledger entries."
            />
          )}
          {!isLoading && rules && rules.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Sponsor</TableHead>
                  <TableHead>Recruit</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Basis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      {rule.sponsorAffiliate.displayName ??
                        rule.sponsorAffiliate.email}
                    </TableCell>
                    <TableCell>
                      {rule.sourceAffiliate?.displayName ??
                        rule.sourceAffiliate?.email ??
                        "—"}
                    </TableCell>
                    <TableCell>{rule.ratePercent}%</TableCell>
                    <TableCell>{rule.basis}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
