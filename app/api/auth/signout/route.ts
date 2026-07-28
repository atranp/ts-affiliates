import { NextResponse } from "next/server";
import { clearImpersonateCookie } from "@/lib/auth-impersonation";
import {
  applyMustChangePasswordCookie,
  clearRoleCookie,
} from "@/lib/auth-role";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.json({ ok: true });
  clearRoleCookie(response);
  clearImpersonateCookie(response);
  applyMustChangePasswordCookie(response, false);
  return response;
}
