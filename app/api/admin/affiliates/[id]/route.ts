import { NextResponse } from "next/server";
import { AffiliateStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { getAffiliateDetail } from "@/lib/admin/queries";
import { applyAffiliateEdit, type AffiliateEdit } from "@/lib/admin/affiliate-write";
import { isAdminMockMode } from "@/lib/mock/config";
import { mockAdminAffiliateDetail } from "@/lib/mock/admin-fixtures";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  if (isAdminMockMode()) {
    const affiliate = mockAdminAffiliateDetail(id);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }
    return jsonCached(affiliate);
  }

  try {
    const affiliate = await getAffiliateDetail(id);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }
    return jsonCached(affiliate);
  } catch (error) {
    console.error("Affiliate detail failed:", error);
    return NextResponse.json(
      { error: "Failed to load affiliate" },
      { status: 500 }
    );
  }
}

/**
 * Writes admin edits through to SliceWP. Only keys present in the body are
 * touched, so a caller can change one field without restating the rest.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  if (isAdminMockMode()) {
    return NextResponse.json(
      { error: "Affiliate edits are disabled in mock mode." },
      { status: 409 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const edit: AffiliateEdit = {};

  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase();
    if (!(status in AffiliateStatus)) {
      return NextResponse.json(
        { error: `Unknown status: ${body.status}` },
        { status: 400 }
      );
    }
    edit.status = status as AffiliateStatus;
  }

  if (body.paymentEmail !== undefined) {
    const email = String(body.paymentEmail).trim();
    if (email && !email.includes("@")) {
      return NextResponse.json(
        { error: "Payment email is not a valid address." },
        { status: 400 }
      );
    }
    edit.paymentEmail = email;
  }

  if (body.commissionRate !== undefined) {
    if (body.commissionRate === null) {
      edit.commissionRate = null;
    } else {
      const rate = Number(body.commissionRate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json(
          { error: "Commission rate must be between 0 and 100." },
          { status: 400 }
        );
      }
      edit.commissionRate = rate;
    }
  }

  if (body.parentSlicewpId !== undefined) {
    if (body.parentSlicewpId === null) {
      edit.parentSlicewpId = null;
    } else {
      const parentId = Number(body.parentSlicewpId);
      if (!Number.isInteger(parentId) || parentId < 0) {
        return NextResponse.json(
          { error: "Sponsor ID must be a positive integer." },
          { status: 400 }
        );
      }
      edit.parentSlicewpId = parentId === 0 ? null : parentId;
    }
  }

  if (body.customSlug !== undefined) {
    edit.customSlug = String(body.customSlug).trim();
  }

  if (Object.keys(edit).length === 0) {
    return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
  }

  try {
    const result = await applyAffiliateEdit({
      affiliateId: id,
      edit,
      adminId: auth.user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Affiliate update failed";

    console.error(`Affiliate update failed for ${id}:`, error);

    if (message === "Affiliate not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    // The production-write guard is a configuration refusal, not a fault.
    if (message.startsWith("Refusing to write")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
