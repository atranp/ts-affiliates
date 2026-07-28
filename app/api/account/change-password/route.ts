import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  applyMustChangePasswordCookie,
} from "@/lib/auth-role";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (auth.user.impersonating) {
    return NextResponse.json(
      { error: "Cannot change password while impersonating" },
      { status: 400 }
    );
  }

  let password: string;
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await prisma.profile.update({
    where: { id: auth.user.id },
    data: { mustChangePassword: false },
  });

  const response = NextResponse.json({ ok: true });
  applyMustChangePasswordCookie(response, false);
  return response;
}
