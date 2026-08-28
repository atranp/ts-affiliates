import { NextResponse } from "next/server";
import { applyAffiliateSelfEdit } from "@/lib/affiliate/settings-write";
import { isAffiliateMockMode } from "@/lib/mock/config";
import {
  mockAffiliateSettings,
  mockSaveAffiliateSettings,
} from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";
import { prisma } from "@/lib/prisma";
import { AffiliateSettingsError } from "@/lib/slicewp-bridge";

/**
 * The affiliate's own SliceWP settings.
 *
 * `/api/settings` is the admin integrations route, so these live under
 * `/api/account/` alongside the password change.
 */

export async function GET() {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  if (isAffiliateMockMode()) {
    return NextResponse.json(mockAffiliateSettings());
  }

  const { affiliateId } = auth.user;
  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: {
      paymentEmail: true,
      email: true,
      website: true,
      customSlug: true,
      referralUrl: true,
    },
  });

  if (!affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  return NextResponse.json({
    paymentEmail: affiliate.paymentEmail,
    accountEmail: affiliate.email,
    website: affiliate.website,
    customSlug: affiliate.customSlug,
    referralUrl: affiliate.referralUrl,
  });
}

/** Only the three fields SliceWP's own Settings tab exposes to affiliates. */
function readEdit(body: Record<string, unknown>) {
  const edit: {
    paymentEmail?: string;
    website?: string;
    customSlug?: string;
  } = {};

  if (typeof body.paymentEmail === "string") {
    edit.paymentEmail = body.paymentEmail.trim();
  }
  if (typeof body.website === "string") {
    edit.website = body.website.trim();
  }
  if (typeof body.customSlug === "string") {
    edit.customSlug = body.customSlug.trim();
  }

  return edit;
}

export async function PATCH(request: Request) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const edit = readEdit(body);

  if (Object.keys(edit).length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  if (isAffiliateMockMode()) {
    const saved = mockSaveAffiliateSettings(edit);

    return saved.ok
      ? NextResponse.json(saved.result)
      : NextResponse.json(
          { error: saved.error, code: saved.code },
          { status: saved.status }
        );
  }

  const { affiliateId } = auth.user;
  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  try {
    return NextResponse.json(
      await applyAffiliateSelfEdit({ affiliateId, edit })
    );
  } catch (error) {
    // SliceWP's rejections are things the affiliate can act on — a taken slug,
    // a malformed email — so its message is passed through rather than
    // flattened into a generic failure.
    if (error instanceof AffiliateSettingsError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus === 409 ? 409 : 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save settings.",
      },
      { status: 500 }
    );
  }
}
