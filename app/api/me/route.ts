import { NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-cache";
import {
  applyMustChangePasswordCookie,
  applyRoleCookie,
  ensureAuthRoleConsistency,
} from "@/lib/auth-role";
import { getAuthBlockReason, getAuthUser } from "@/lib/auth";
import { touchAffiliateLastSignIn } from "@/lib/admin/affiliate-portal";
import { linkProfileToAffiliateByEmail } from "@/lib/sync";
import { createClient } from "@/lib/supabase/server";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { MOCK_AUTH_USER } from "@/lib/mock/affiliate-auth";

const blockMessages: Record<string, string> = {
  NO_PROFILE: "Your account is not set up. Contact an administrator.",
  PORTAL_DISABLED: "Portal access has been disabled. Contact an administrator.",
  AFFILIATE_INACTIVE:
    "Your affiliate account is not active. Contact an administrator.",
};

export async function GET() {
  if (isAffiliateMockMode()) {
    const response = jsonCached(MOCK_AUTH_USER);
    applyRoleCookie(response, MOCK_AUTH_USER.role);
    applyMustChangePasswordCookie(response, false);
    return response;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await linkProfileToAffiliateByEmail(user.id, user.email ?? "");
  await ensureAuthRoleConsistency(
    user.id,
    user.app_metadata?.role as string | undefined
  );

  const blockReason = await getAuthBlockReason(user.id);
  if (blockReason) {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error: blockMessages[blockReason],
        code: blockReason,
      },
      { status: 403 }
    );
  }

  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!authUser.impersonating && authUser.role === "AFFILIATE") {
    await touchAffiliateLastSignIn(authUser.id);
  }

  const response = jsonCached(authUser);
  applyRoleCookie(response, authUser.role);
  applyMustChangePasswordCookie(response, !!authUser.mustChangePassword);
  return response;
}
