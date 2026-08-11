import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  buildPayoutCsv,
  parsePayoutCutoff,
  parsePayoutTarget,
  PayoutInputError,
} from "@/lib/payouts/create";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockAdminPayoutExport } from "@/lib/mock/admin-fixtures";

/**
 * Every line a payout would settle, for checking against SliceWP before paying.
 * Takes the same parameters as the preview so the file and the on-screen review
 * describe the same selection.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const affiliateId = params.get("affiliateId");
  if (!affiliateId) {
    return NextResponse.json(
      { error: "affiliateId is required" },
      { status: 400 }
    );
  }

  try {
    const selection = {
      affiliateId,
      target: parsePayoutTarget({
        scope: params.get("scope"),
        teamId: params.get("teamId") ?? undefined,
        memberId: params.get("memberId") ?? undefined,
        directPayoutSource: params.get("directPayoutSource") ?? undefined,
        directPayoutId: params.get("directPayoutId") ?? undefined,
      }),
      cutoff: parsePayoutCutoff(params.get("cutoff")),
    };

    if (isAdminMockMode()) {
      const csv = mockAdminPayoutExport(selection);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="payout-mock-export.csv"`,
        },
      });
    }

    const { filename, csv } = await buildPayoutCsv(selection);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof PayoutInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Payout export failed:", error);
    return NextResponse.json(
      { error: "Could not build the export." },
      { status: 500 }
    );
  }
}
