import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

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
