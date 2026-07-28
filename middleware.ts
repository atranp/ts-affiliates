import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  IMPERSONATE_COOKIE,
} from "@/lib/auth-impersonation";
import {
  MUST_CHANGE_PASSWORD_COOKIE,
  ROLE_COOKIE,
  roleFromRequest,
} from "@/lib/auth-role";
import { homePathForRole } from "@/lib/routes";

const adminPaths = ["/admin"];
const affiliatePaths = ["/dashboard", "/account"];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const role = roleFromRequest(
    request.cookies.get(ROLE_COOKIE)?.value,
    user?.app_metadata?.role as string | undefined
  );
  const impersonating = !!request.cookies.get(IMPERSONATE_COOKIE)?.value;
  const mustChangePassword =
    request.cookies.get(MUST_CHANGE_PASSWORD_COOKIE)?.value === "1";

  if (pathname.startsWith("/login") || pathname.startsWith("/auth")) {
    if (user) {
      return NextResponse.redirect(
        new URL(homePathForRole(role), request.url)
      );
    }
    return supabaseResponse;
  }

  if (pathname === "/") {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(new URL(homePathForRole(role), request.url));
  }

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (
    mustChangePassword &&
    role === "AFFILIATE" &&
    !pathname.startsWith("/account/change-password")
  ) {
    return NextResponse.redirect(
      new URL("/account/change-password", request.url)
    );
  }

  if (
    adminPaths.some((path) => pathname.startsWith(path)) &&
    role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    affiliatePaths.some((path) => pathname.startsWith(path)) &&
    role === "ADMIN" &&
    !impersonating
  ) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/login",
    "/auth/:path*",
  ],
};
