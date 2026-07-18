import { Role } from "@prisma/client";

export function homePathForRole(role: Role | string | undefined): string {
  return role === Role.ADMIN || role === "ADMIN" ? "/admin" : "/dashboard";
}
