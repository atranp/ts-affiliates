import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const parsed = new URL(url);

  // Supabase transaction pooler (6543) — use for all runtime queries.
  // DIRECT_URL / session pooler (5432) is for migrations only; it caps at ~15 clients.
  if (parsed.port === "6543" || parsed.hostname.includes("pooler.supabase.com")) {
    parsed.searchParams.set("pgbouncer", "true");
  }

  if (!parsed.searchParams.has("connection_limit")) {
    parsed.searchParams.set("connection_limit", "1");
  }

  return parsed.toString();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: resolveDatabaseUrl() },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
