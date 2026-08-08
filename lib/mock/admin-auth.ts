import { Role } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";

export const MOCK_ADMIN_USER_ID = "mock-user-admin";

export const MOCK_ADMIN_USER: AuthUser = {
  id: MOCK_ADMIN_USER_ID,
  email: "admin@true-sciences.local",
  name: "Demo Admin",
  role: Role.ADMIN,
  affiliateId: null,
  affiliateName: null,
  mustChangePassword: false,
};

export function isMockAdminUser(user: AuthUser | null | undefined): boolean {
  return user?.id === MOCK_ADMIN_USER_ID;
}
