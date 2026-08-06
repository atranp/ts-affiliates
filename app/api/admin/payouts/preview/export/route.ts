import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { formatPeriodLabel } from "@/lib/payouts/dates";
import { resolvePayoutPeriodFromRequest } from "@/lib/payouts/parse-period";
import { getPayoutPreviewEntries } from "@/lib/teams/queries";
import type { PayoutScope } from "@/lib/payouts/types";

const COLUMNS = [
  "Sale date",
  "Type",
  "Recruit",
  "Order",
  "Sale amount",
  "Rate",
  "Earned",
  "Description",
];

function csvCell(value: string | number | null) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);

  try {
    const { periodStart, periodEnd } = resolvePayoutPeriodFromRequest({
      periodStart: searchParams.get("periodStart"),
      periodEnd: searchParams.get("periodEnd"),
    });

    const entries = await getPayoutPreviewEntries({
      periodStart,
      periodEnd,
      teamId: searchParams.get("teamId") ?? undefined,
      sponsorAffiliateId: searchParams.get("sponsorAffiliateId") ?? undefined,
      sourceAffiliateId: searchParams.get("sourceAffiliateId") ?? undefined,
      scope: (searchParams.get("scope") as PayoutScope | null) ?? undefined,
    });

    const rows = entries.map((entry) =>
      [
        entry.occurredAt.slice(0, 10),
        entry.type === "OVERRIDE" ? "Team bonus" : "Direct",
        entry.sourceAffiliateName ?? "",
        entry.wooOrderId ? `#${entry.wooOrderId}` : "",
        entry.orderRevenue == null ? "" : entry.orderRevenue.toFixed(2),
        entry.orderRevenue
          ? `${((entry.amount / entry.orderRevenue) * 100).toFixed(2)}%`
          : "",
        entry.amount.toFixed(2),
        entry.description ?? "",
      ]
        .map(csvCell)
        .join(",")
    );

    const csv = [COLUMNS.join(","), ...rows].join("\n");
    const label = formatPeriodLabel(periodStart, periodEnd).replace(
      /[^\w-]+/g,
      "-"
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payout-${label}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid date range" },
      { status: 400 }
    );
  }
}
