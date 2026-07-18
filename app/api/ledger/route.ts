import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getLedgerSummary } from "@/lib/rules-engine";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as CommissionStatus | null;
  const type = searchParams.get("type") as LedgerEntryType | null;
  const sourceAffiliateId = searchParams.get("sourceAffiliateId");

  let affiliateId = auth.user.affiliateId;
  if (auth.user.role === "ADMIN" && searchParams.get("affiliateId")) {
    affiliateId = searchParams.get("affiliateId");
  }

  if (!affiliateId) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      affiliateId,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(sourceAffiliateId ? { sourceAffiliateId } : {}),
    },
    include: {
      sourceAffiliate: {
        select: { id: true, email: true, displayName: true },
      },
      dealRule: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const summary = await getLedgerSummary(affiliateId, {
    type: type ?? undefined,
    sourceAffiliateId: sourceAffiliateId ?? undefined,
  });

  const sourceAffiliates = await prisma.affiliate.findMany({
    where: {
      id: {
        in: entries
          .map((entry) => entry.sourceAffiliateId)
          .filter((id): id is string => !!id),
      },
    },
    select: { id: true, email: true, displayName: true },
  });

  return NextResponse.json({
    entries,
    summary,
    sourceAffiliates,
  });
}
