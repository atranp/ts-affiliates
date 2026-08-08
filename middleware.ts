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
import { homePathForRole, NEXT_PARAM, safeNextPath } from "@/lib/routes";

const adminPaths = ["/admin"];
const affiliatePaths = ["/dashboard", "/account"];

function isAffiliateMockMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AFFILIATE_MOCK_DATA === "true";
}

function isAdminMockMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.ADMIN_MOCK_DATA === "true";
}

/** Sends an unauthenticated visitor to sign in without losing the deep link. */
function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const intended = request.nextUrl.pathname + request.nextUrl.search;
  if (safeNextPath(intended)) {
    loginUrl.searchParams.set(NEXT_PARAM, intended);
  }
  return NextResponse.redirect(loginUrl);
}

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
      const next = safeNextPath(request.nextUrl.searchParams.get(NEXT_PARAM));
      return NextResponse.redirect(
        new URL(next ?? homePathForRole(role), request.url)
      );
    }
    return supabaseResponse;
  }

  if (pathname === "/") {
    if (!user) {
      if (isAdminMockMode()) {
        return NextResponse.redirect(new URL("/admin/payouts/new", request.url));
      }
      if (isAffiliateMockMode()) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(new URL(homePathForRole(role), request.url));
  }

  if (!user) {
    if (
      isAffiliateMockMode() &&
      affiliatePaths.some((path) => pathname.startsWith(path))
    ) {
      return supabaseResponse;
    }
    if (isAdminMockMode() && adminPaths.some((path) => pathname.startsWith(path))) {
      return supabaseResponse;
    }
    return redirectToLogin(request);
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
    if (isAdminMockMode()) {
      return supabaseResponse;
    }
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
