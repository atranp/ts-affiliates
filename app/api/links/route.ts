import { NextResponse } from "next/server";
import { getAffiliateLink } from "@/lib/affiliate/reach";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockAffiliateLink, mockGeneratedLink } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";
import { prisma } from "@/lib/prisma";
import { generateAffiliateLink } from "@/lib/slicewp-bridge";

/** The affiliate's referral link and custom slug. */
export async function GET() {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  if (isAffiliateMockMode()) {
    return NextResponse.json(mockAffiliateLink());
  }

  const { affiliateId } = auth.user;
  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  return NextResponse.json(await getAffiliateLink(affiliateId));
}

/**
 * Builds a referral link for a landing page the affiliate pastes in.
 *
 * A write verb for a read-only operation, because the URL is user input and
 * does not belong in a query string that ends up in logs and history. WordPress
 * generates the link — see `generateAffiliateLink`.
 */
export async function POST(request: Request) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
  } | null;

  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url) {
    return NextResponse.json({ error: "Enter a link first." }, { status: 400 });
  }

  if (isAffiliateMockMode()) {
    return NextResponse.json({ referralUrl: mockGeneratedLink(url) });
  }

  const { affiliateId } = auth.user;
  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { slicewpId: true },
  });

  if (!affiliate) {
    return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
  }

  try {
    return NextResponse.json({
      referralUrl: await generateAffiliateLink(affiliate.slicewpId, url),
    });
  } catch (error) {
    // The store rejects off-site URLs, which is a normal thing for someone to
    // try rather than a fault, so it comes back as a plain message.
    const message =
      error instanceof Error ? error.message : "Could not build that link.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
