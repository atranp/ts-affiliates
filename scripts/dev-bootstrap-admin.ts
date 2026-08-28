import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Creates an admin login on the local Supabase stack (Mode C).
 *
 * The deployed app's admin accounts live in the production Supabase project, so
 * a freshly pushed local database has no way in. This mints one against
 * whatever Supabase `.env.local` points at, and refuses if that is production —
 * where creating an admin is an actual privilege-escalation.
 *
 * Usage: npx tsx scripts/dev-bootstrap-admin.ts [email] [password]
 */

const DEFAULT_EMAIL = "dev-admin@example.com";
const DEFAULT_PASSWORD = "devadmin1234";

async function main() {
  const { isProductionDatabase } = await import("../lib/env-guard");
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { prisma } = await import("../lib/prisma");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(unset)";

  console.log(`supabase:   ${supabaseUrl}`);
  console.log(`production: ${isProductionDatabase()}\n`);

  if (isProductionDatabase()) {
    throw new Error(
      "Refusing to create an admin account on the production Supabase project."
    );
  }

  const email = process.argv[2] ?? DEFAULT_EMAIL;
  const password = process.argv[3] ?? DEFAULT_PASSWORD;

  const supabase = createAdminClient();

  const existing = await supabase.auth.admin.listUsers();
  const match = existing.data?.users.find((user) => user.email === email);

  let userId: string;

  if (match) {
    userId = match.id;
    await supabase.auth.admin.updateUserById(userId, { password });
    console.log(`reused auth user ${userId} (password reset)`);
  } else {
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created.error || !created.data.user) {
      throw new Error(
        `Could not create auth user: ${created.error?.message ?? "unknown error"}`
      );
    }

    userId = created.data.user.id;
    console.log(`created auth user ${userId}`);
  }

  await prisma.profile.upsert({
    where: { id: userId },
    update: { role: "ADMIN", email, name: "Dev Admin" },
    create: { id: userId, email, name: "Dev Admin", role: "ADMIN" },
  });

  console.log(`profile upserted with role ADMIN\n`);
  console.log(`Sign in at http://localhost:3000 with:`);
  console.log(`  ${email}`);
  console.log(`  ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
