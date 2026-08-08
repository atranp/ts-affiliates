import { NextResponse } from "next/server";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { MOCK_AUTH_USER } from "@/lib/mock/affiliate-auth";
import type { AuthUser } from "@/lib/auth";
import { requireAuth } from "@/lib/api-auth";

type AuthResult =
  | { user: AuthUser }
  | { error: NextResponse };

/** Affiliate API routes — returns mock user in dev when AFFILIATE_MOCK_DATA=true. */
export async function requireAffiliateAuth(): Promise<AuthResult> {
  if (isAffiliateMockMode()) {
    return { user: MOCK_AUTH_USER };
  }
  return requireAuth();
}

export function mockModeBlockedResponse(): NextResponse | null {
  if (isAffiliateMockMode()) {
    return NextResponse.json(
      { error: "Unavailable in affiliate mock mode" },
      { status: 501 }
    );
  }
  return null;
}
