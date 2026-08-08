import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  createPayout,
  parsePayoutCutoff,
  parsePayoutTarget,
  previewPayout,
  PayoutConflictError,
  PayoutInputError,
} from "@/lib/payouts/create";
import { isAdminMockMode } from "@/lib/mock/config";
import {
  mockAdminCreatePayout,
  mockAdminPayoutPreview,
} from "@/lib/mock/admin-fixtures";

function handleError(error: unknown) {
  if (error instanceof PayoutInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PayoutConflictError) {
    return NextResponse.json(
      { error: error.message, actual: error.actual },
      { status: 409 }
    );
  }
  console.error("Payout create failed:", error);
  return NextResponse.json(
    { error: "Could not complete the payout. Nothing was changed." },
    { status: 500 }
  );
}

/**
 * Previews what a payout would cover. The cutoff is normally carried over from
 * the options call so the review step prices against the same instant.
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
      }),
      cutoff: parsePayoutCutoff(params.get("cutoff")),
    };
    const draft = isAdminMockMode()
      ? mockAdminPayoutPreview(selection)
      : await previewPayout(selection);
    return NextResponse.json(draft);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { affiliateId, scope, teamId, memberId, cutoff, expected } =
    body as Record<string, unknown>;

  if (typeof affiliateId !== "string" || !affiliateId) {
    return NextResponse.json(
      { error: "affiliateId is required" },
      { status: 400 }
    );
  }

  try {
    const selection = {
      affiliateId,
      target: parsePayoutTarget({ scope, teamId, memberId }),
      cutoff: parsePayoutCutoff(cutoff),
      expected: parseExpected(expected),
    };
    const payout = isAdminMockMode()
      ? mockAdminCreatePayout(selection, selection.expected)
      : await createPayout(selection);
    return NextResponse.json(payout, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

function parseExpected(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const { entryCount, totalAmount } = value as Record<string, unknown>;
  if (typeof entryCount !== "number" || typeof totalAmount !== "number") {
    return undefined;
  }
  return { entryCount, totalAmount };
}
