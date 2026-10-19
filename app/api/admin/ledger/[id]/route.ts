import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth";
import {
  parseAmount,
  parseStatus,
  updateLedgerEntry,
} from "@/lib/ledger/admin";
import { readJsonObject } from "@/lib/api/body";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  const parsed = await readJsonObject(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  const input: {
    status?: ReturnType<typeof parseStatus>;
    amount?: number;
    description?: string | null;
  } = {};

  try {
    if (body.status !== undefined) {
      input.status = parseStatus(body.status);
    }
    if (body.amount !== undefined) {
      input.amount = parseAmount(body.amount);
    }
    if (body.description !== undefined) {
      input.description =
        body.description === null ? null : String(body.description);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid input" },
      { status: 400 }
    );
  }

  if (
    input.status === undefined &&
    input.amount === undefined &&
    input.description === undefined
  ) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  try {
    const entry = await updateLedgerEntry(id, input);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 }
    );
  }
}
