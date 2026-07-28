import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAuthUser, getRealAuthUser, isAdmin } from "./auth";

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
  try {
    const user = await getRealAuthUser();
    if (!user) {
      return {
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    if (!isAdmin(user.role)) {
      return {
        error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { user };
  } catch (error) {
    console.error("Admin auth check failed:", error);
    return {
      error: NextResponse.json(
        { error: "Database unavailable. Try again in a moment." },
        { status: 503 }
      ),
    };
  }
}

export { isAdmin, Role };
