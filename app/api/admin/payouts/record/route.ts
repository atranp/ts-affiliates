import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { startOfStoreDay } from "@/lib/payouts/store-dates";
import {
  previewHistoricalPayout,
  recordHistoricalPayout,
} from "@/lib/payouts/record-historical";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const affiliateId = searchParams.get("affiliateId");
  const teamId = searchParams.get("teamId") ?? undefined;
  const entryIdsParam = searchParams.get("entryIds");

  if (!affiliateId) {
    return NextResponse.json(
      { error: "affiliateId is required" },
      { status: 400 }
    );
  }

  const entryIds = entryIdsParam
    ? entryIdsParam.split(",").filter(Boolean)
    : undefined;

  const preview = await previewHistoricalPayout({
    affiliateId,
    teamId,
    entryIds,
  });

  return NextResponse.json(preview);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const {
    affiliateId,
    paidAt,
    label,
    teamId,
    mode,
    entryIds,
    amount,
    description,
  } = body as {
    affiliateId?: string;
    paidAt?: string;
    label?: string;
    teamId?: string | null;
    mode?: "entries" | "lump_sum";
    entryIds?: string[];
    amount?: number;
    description?: string;
  };

  if (!affiliateId || !paidAt || !mode) {
    return NextResponse.json(
      { error: "affiliateId, paidAt, and mode are required" },
      { status: 400 }
    );
  }

  if (mode !== "entries" && mode !== "lump_sum") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  try {
    const result = await recordHistoricalPayout({
      affiliateId,
      paidAt: startOfStoreDay(new Date(paidAt)),
      label,
      teamId: teamId ?? null,
      mode,
      entryIds,
      amount,
      description,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Record payout failed" },
      { status: 400 }
    );
  }
}
