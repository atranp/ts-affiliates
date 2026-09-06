import { config } from "dotenv";
import { randomInt } from "node:crypto";

config({ path: ".env" });
config({ path: ".env.local", override: true });

if (process.env.BACKFILL_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.BACKFILL_DATABASE_URL;
  process.env.DIRECT_URL =
    process.env.BACKFILL_DIRECT_URL ?? process.env.BACKFILL_DATABASE_URL;
}

// `config({ override: true })` above reinstates whatever mode .env.local is in,
// so the auth target has to be re-applied after it, exactly like the database
// URL. Without this the script writes rows to one project and logins to another.
if (process.env.BACKFILL_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.BACKFILL_SUPABASE_URL;
}
if (process.env.BACKFILL_SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.BACKFILL_SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Mint or refresh platform ADMIN logins on production Supabase.
 *
 * Outputs one-time invite links (same flow as affiliate onboarding). Nothing
 * is emailed — deliver links manually.
 *
 * Usage:
 *   ALLOW_PRODUCTION_WRITES=true npx tsx scripts/bootstrap-prod-admin.ts --dry-run
 *   ALLOW_PRODUCTION_WRITES=true npx tsx scripts/bootstrap-prod-admin.ts --apply
 *   ALLOW_PRODUCTION_WRITES=true npx tsx scripts/bootstrap-prod-admin.ts --apply --email=g@x.com --name=Gavin
 *
 * Uses BACKFILL_DATABASE_URL / BACKFILL_DIRECT_URL when set (prod targeting).
 */

import { Role } from "@prisma/client";
import {
  buildPortalConfirmUrl,
  buildPortalInviteMessage,
  PORTAL_LINK_TTL_HOURS,
  resolveAppOrigin,
} from "../lib/admin/portal-credentials";

const DEFAULT_ADMINS = [
  { email: "anthony@true-sciences.com", name: "Anthony" },
  { email: "gavin@true-sciences.com", name: "Gavin" },
  { email: "stone@true-sciences.com", name: "Stone" },
] as const;

const SET_PASSWORD_PATH = "/account/change-password";

function parseArgs() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;
  const emailArg = process.argv.find((arg) => arg.startsWith("--email="));
  const nameArg = process.argv.find((arg) => arg.startsWith("--name="));

  const admins =
    emailArg && nameArg
      ? [
          {
            email: emailArg.split("=")[1]!.trim().toLowerCase(),
            name: nameArg.split("=")[1]!.trim(),
          },
        ]
      : DEFAULT_ADMINS.map((row) => ({ ...row }));

  return { dryRun, admins };
}

function unknowablePassword(length = 48): string {
  const alphabet =
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[randomInt(alphabet.length)];
  }
  return result;
}

async function findAuthUserIdByEmail(
  listUsers: (page: number) => Promise<{ data?: { users: Array<{ id: string; email?: string }> } }>,
  email: string
): Promise<string | null> {
  const normalized = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data } = await listUsers(page);
    const match = data?.users.find(
      (user) => user.email?.toLowerCase() === normalized
    );
    if (match) return match.id;
    if (!data?.users.length) break;
  }
  return null;
}

async function main() {
  const { dryRun, admins } = parseArgs();
  const { isProductionDatabase, assertAuthMatchesDatabase } = await import(
    "../lib/env-guard"
  );

  if (!isProductionDatabase()) {
    throw new Error(
      "DATABASE_URL does not look like production. Set BACKFILL_DATABASE_URL or point .env.local at prod deliberately."
    );
  }

  // Profile rows go through Prisma, auth users through Supabase. Those read
  // different env vars and can silently target different projects.
  assertAuthMatchesDatabase();

  if (dryRun) {
    console.log("DRY RUN — pass --apply to mint links.\n");
  } else {
    process.env.ALLOW_PRODUCTION_WRITES = "true";
  }

  const { createAdminClient } = await import("../lib/supabase/admin");
  const { prisma } = await import("../lib/prisma");
  const { ensureAuthRoleConsistency } = await import("../lib/auth-role");

  const supabase = createAdminClient();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : resolveAppOrigin("https://ts-affiliates.vercel.app"));

  console.log(`origin: ${origin}`);
  console.log(`admins: ${admins.map((a) => a.email).join(", ")}\n`);

  for (const admin of admins) {
    console.log(`── ${admin.name} <${admin.email}> ──`);

    const existingProfile = await prisma.profile.findFirst({
      where: { email: { equals: admin.email, mode: "insensitive" } },
      select: { id: true, role: true },
    });

    if (dryRun) {
      console.log(
        existingProfile
          ? `  profile exists role=${existingProfile.role} id=${existingProfile.id}`
          : "  no profile yet"
      );
      continue;
    }

    let authUserId = await findAuthUserIdByEmail(
      (page) => supabase.auth.admin.listUsers({ page, perPage: 200 }),
      admin.email
    );

    // Profile row is canonical when it already exists.
    if (
      existingProfile &&
      authUserId &&
      authUserId !== existingProfile.id
    ) {
      console.log(
        `  removing orphan auth user ${authUserId} (profile is ${existingProfile.id})`
      );
      await supabase.auth.admin.deleteUser(authUserId);
      authUserId = null;
    }

    let userId = authUserId ?? null;

    if (userId) {
      const updated = await supabase.auth.admin.updateUserById(userId, {
        password: unknowablePassword(),
        email: admin.email,
        email_confirm: true,
        app_metadata: { role: Role.ADMIN },
        user_metadata: { name: admin.name },
      });
      if (updated.error) {
        throw new Error(
          `Could not update auth user ${userId}: ${updated.error.message}`
        );
      }
      console.log(`  reused auth user ${userId} (password retired)`);
    } else if (existingProfile) {
      const created = await supabase.auth.admin.createUser({
        id: existingProfile.id,
        email: admin.email,
        password: unknowablePassword(),
        email_confirm: true,
        app_metadata: { role: Role.ADMIN },
        user_metadata: { name: admin.name },
      });
      if (created.error || !created.data.user) {
        throw new Error(
          `Could not recreate auth for profile ${existingProfile.id}: ${created.error?.message ?? "unknown"}`
        );
      }
      userId = created.data.user.id;
      console.log(`  recreated auth user ${userId} for existing profile`);
    } else {
      const created = await supabase.auth.admin.createUser({
        email: admin.email,
        password: unknowablePassword(),
        email_confirm: true,
        app_metadata: { role: Role.ADMIN },
        user_metadata: { name: admin.name },
      });
      if (created.error || !created.data.user) {
        throw new Error(
          `Could not create ${admin.email}: ${created.error?.message ?? "unknown"}`
        );
      }
      userId = created.data.user.id;
      console.log(`  created auth user ${userId}`);
    }

    await prisma.profile.upsert({
      where: { id: userId },
      update: {
        email: admin.email,
        name: admin.name,
        role: Role.ADMIN,
        mustChangePassword: true,
        portalDisabledAt: null,
        affiliateId: null,
      },
      create: {
        id: userId,
        email: admin.email,
        name: admin.name,
        role: Role.ADMIN,
        mustChangePassword: true,
      },
    });

    await ensureAuthRoleConsistency(userId, Role.ADMIN);

    // User always exists in Auth by this point — invite links are pre-create only.
    const linkKind = "recovery" as const;
    const { data, error } = await supabase.auth.admin.generateLink({
      type: linkKind,
      email: admin.email,
    });

    if (error || !data.properties?.hashed_token) {
      throw new Error(
        `generateLink failed for ${admin.email}: ${error?.message ?? "no token"}`
      );
    }

    const inviteLink = buildPortalConfirmUrl({
      origin,
      tokenHash: data.properties.hashed_token,
      kind: linkKind,
      next: SET_PASSWORD_PATH,
    });

    const inviteMessage = buildPortalInviteMessage({
      name: admin.name,
      email: admin.email,
      link: inviteLink,
      kind: linkKind,
    });

    console.log(`  profile upserted ADMIN mustChangePassword=true`);
    console.log(`  link (${PORTAL_LINK_TTL_HOURS}h wording):\n`);
    console.log(inviteMessage);
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
