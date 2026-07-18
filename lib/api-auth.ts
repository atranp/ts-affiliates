import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "./auth";

export async function requireAuth() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return {
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    return { user };
  } catch (error) {
    console.error("Auth check failed:", error);
    return {
      error: NextResponse.json(
        { error: "Database unavailable. Try again in a moment." },
        { status: 503 }
      ),
    };
  }
}

export async function requireAdmin() {
  const result = await requireAuth();
  if ("error" in result) return result;
  if (!isAdmin(result.user.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return result;
}

export { isAdmin, Role };
