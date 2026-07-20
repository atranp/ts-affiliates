import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  applyRoleCookie,
  ensureAuthRoleConsistency,
} from "@/lib/auth-role";
import { homePathForRole } from "@/lib/routes";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const role = user
        ? await ensureAuthRoleConsistency(
            user.id,
            user.app_metadata?.role as string | undefined
          )
        : null;
      const destination = next ?? homePathForRole(role ?? undefined);
      const response = NextResponse.redirect(`${origin}${destination}`);
      if (role) applyRoleCookie(response, role);
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
