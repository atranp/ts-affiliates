import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";

// Imported by middleware, so this module must stay edge-safe: no Prisma
// client, Supabase admin client, or Node-only APIs.

export const ROLE_COOKIE = "ts-role";
export const MUST_CHANGE_PASSWORD_COOKIE = "ts-must-change-password";

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

export function applyMustChangePasswordCookie(
  response: NextResponse,
  mustChange: boolean
) {
  response.cookies.set(MUST_CHANGE_PASSWORD_COOKIE, mustChange ? "1" : "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: mustChange ? 60 * 60 * 24 * 30 : 0,
  });
  return response;
}

export function roleFromRequest(
  cookieRole: string | undefined,
  jwtRole: string | undefined
): string | undefined {
  if (cookieRole === "ADMIN" || cookieRole === "AFFILIATE") {
    return cookieRole;
  }
  return jwtRole;
}
