import { Role } from "@prisma/client";

export function homePathForRole(role: Role | string | undefined): string {
  return role === Role.ADMIN || role === "ADMIN" ? "/admin" : "/dashboard";
}

export const NEXT_PARAM = "next";

/**
 * Only same-origin paths may be used as a post-login destination, so an
 * attacker cannot turn the login form into an open redirect.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/login") || value.startsWith("/auth")) return null;
  return value;
}
