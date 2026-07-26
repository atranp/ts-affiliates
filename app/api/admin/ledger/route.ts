import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  bulkUpdateLedgerStatus,
  createAdjustmentEntry,
  parseStatus,
} from "@/lib/ledger/admin";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const affiliateId =
    typeof body.affiliateId === "string" ? body.affiliateId : "";
  const description =
    typeof body.description === "string" ? body.description : "";
  const amount = body.amount;

  if (!affiliateId) {
    return NextResponse.json(
      { error: "affiliateId is required" },
      { status: 400 }
    );
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { id: true },
  });
  if (!affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  try {
    const status =
      body.status !== undefined ? parseStatus(body.status) : undefined;
    const entry = await createAdjustmentEntry({
      affiliateId,
      amount: Number(amount),
      description,
      status,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids array is required" },
      { status: 400 }
    );
  }

  try {
    const status = parseStatus(body.status);
    const result = await bulkUpdateLedgerStatus(ids, status);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk update failed" },
      { status: 400 }
    );
  }
}
