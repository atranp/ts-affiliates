import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

export const ROLE_COOKIE = "ts-role";

/** Profile.role is the source of truth — keep Supabase JWT + routing cookie in sync. */
export async function resolveProfileRole(userId: string): Promise<Role | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return profile?.role ?? null;
}

export async function syncSupabaseRoleMetadata(
  userId: string,
  role: Role
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });
}

export async function ensureAuthRoleConsistency(
  userId: string,
  jwtRole?: string
): Promise<Role | null> {
  const role = await resolveProfileRole(userId);
  if (!role) return null;

  if (jwtRole === role) return role;

  await syncSupabaseRoleMetadata(userId, role);
  return role;
}

export function applyRoleCookie(response: NextResponse, role: Role) {
  response.cookies.set(ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export function clearRoleCookie(response: NextResponse) {
  response.cookies.set(ROLE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function roleFromRequest(
  cookieRole: string | undefined,
  jwtRole: string | undefined
): string | undefined {
  if (cookieRole === Role.ADMIN || cookieRole === Role.AFFILIATE) {
    return cookieRole;
  }
  return jwtRole;
}
