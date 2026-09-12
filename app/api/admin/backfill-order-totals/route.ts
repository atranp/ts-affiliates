import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { backfillOrderTotals } from "@/lib/backfill/order-totals";

/**
 * Runs the commissionable-base backfill where the store credentials live.
 *
 * The production WooCommerce keys only exist in this environment, so a
 * workstation run either can't authenticate or silently reads a local copy of
 * the site. Exposing it as a route keeps the figures sourced from the real store
 * and makes the backfill re-runnable whenever a totals gap reappears.
 */

export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.SYNC_CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || auth === secret;
}

function positiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function run(request: Request, apply: boolean) {
  if (!authorizeCron(request)) {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
  }

  const url = new URL(request.url);
  const limit = positiveInt(url.searchParams.get("limit"));
  const affiliateSlicewpId = positiveInt(url.searchParams.get("affiliate"));
  const concurrency = positiveInt(url.searchParams.get("concurrency")) ?? 2;

  try {
    const result = await backfillOrderTotals({
      apply,
      limit,
      affiliateSlicewpId,
      concurrency: Math.min(concurrency, 4),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Order totals backfill failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backfill failed" },
      { status: 500 }
    );
  }
}

/** Dry run: reports what would be written without touching anything. */
export async function GET(request: Request) {
  return run(request, false);
}

export async function POST(request: Request) {
  return run(request, true);
}
