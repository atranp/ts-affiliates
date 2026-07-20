import { NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-cache";
import {
  applyRoleCookie,
  ensureAuthRoleConsistency,
} from "@/lib/auth-role";
import { getAuthUser } from "@/lib/auth";
import { linkProfileToAffiliateByEmail } from "@/lib/sync";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = jsonCached(authUser);
  return applyRoleCookie(response, authUser.role);
}
