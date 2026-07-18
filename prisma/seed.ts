import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });
import { PrismaClient, Role } from "@prisma/client";
import { createAdminClient } from "../lib/supabase/admin";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    },
  },
});

const USERS = [
  {
    email: "anthony@true-sciences.com",
    name: "Anthony",
    password: "changeme123",
    role: Role.ADMIN,
  },
  {
    email: "trindalyn.mackenzie11@gmail.com",
    name: "Trindalyn",
    password: "changeme123",
    role: Role.AFFILIATE,
  },
];

async function seedUsers() {
  const supabase = createAdminClient();
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingByEmail = new Map(
    existingUsers.users.map((user) => [user.email?.toLowerCase(), user])
  );

  for (const user of USERS) {
    const existing = existingByEmail.get(user.email.toLowerCase());
    let userId = existing?.id;

    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        password: user.password,
        app_metadata: { role: user.role },
        user_metadata: { name: user.name },
      });
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        app_metadata: { role: user.role },
        user_metadata: { name: user.name },
      });

      if (error) {
        throw new Error(`Failed to create ${user.email}: ${error.message}`);
      }

      userId = data.user.id;
    }

    if (!userId) continue;

    await prisma.profile.upsert({
      where: { id: userId },
      update: { email: user.email, name: user.name, role: user.role },
      create: {
        id: userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  }
}

async function main() {
  await seedUsers();

  await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  console.log("Seed complete.");
  console.log("Admin: anthony@true-sciences.com");
  console.log("Affiliate example: trindalyn.mackenzie11@gmail.com");
  console.log("Default password: changeme123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
