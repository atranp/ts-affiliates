import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Next.js uses .env.local; Prisma CLI only loads .env by default.
config({ path: ".env" });
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
    directUrl: env("DIRECT_URL"),
  },
});
