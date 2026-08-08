import { Role } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";

export const MOCK_AFFILIATE_ID = "mock-affiliate-trindalyn";
export const MOCK_USER_ID = "mock-user-trindalyn";

export const MOCK_AUTH_USER: AuthUser = {
  id: MOCK_USER_ID,
  email: "demo.affiliate@true-sciences.local",
  name: "Trindalyn Mackenzie",
  role: Role.AFFILIATE,
  affiliateId: MOCK_AFFILIATE_ID,
  affiliateName: "Trindalyn Mackenzie",
  mustChangePassword: false,
};

export function isMockAuthUser(user: AuthUser | null | undefined): boolean {
  return user?.id === MOCK_USER_ID;
}
