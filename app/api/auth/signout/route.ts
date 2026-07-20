import { NextResponse } from "next/server";
import { clearRoleCookie } from "@/lib/auth-role";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.json({ ok: true });
  return clearRoleCookie(response);
}
