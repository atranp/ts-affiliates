import { NextResponse } from "next/server";
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

  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(authUser);
}
