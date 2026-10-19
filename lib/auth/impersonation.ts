import { NextResponse } from "next/server";

export const IMPERSONATE_COOKIE = "ts-impersonate";

export function applyImpersonateCookie(
  response: NextResponse,
  affiliateId: string
) {
  response.cookies.set(IMPERSONATE_COOKIE, affiliateId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}

export function clearImpersonateCookie(response: NextResponse) {
  response.cookies.set(IMPERSONATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
