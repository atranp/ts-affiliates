import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ROLE_COOKIE, roleFromRequest } from "@/lib/auth-role";
import { homePathForRole } from "@/lib/routes";

const adminPaths = ["/admin"];
const affiliatePaths = ["/dashboard"];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const role = roleFromRequest(
    request.cookies.get(ROLE_COOKIE)?.value,
    user?.app_metadata?.role as string | undefined
  );

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
    adminPaths.some((path) => pathname.startsWith(path)) &&
    role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    affiliatePaths.some((path) => pathname.startsWith(path)) &&
    role === "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/login", "/auth/:path*"],
};
