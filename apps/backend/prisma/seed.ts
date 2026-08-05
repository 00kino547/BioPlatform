import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { getEnv } from "../src/config/env.js";

const prisma = new PrismaClient();

async function main() {
  const env = getEnv();
  const adminEmail = env.ADMIN_EMAIL;
  const adminPassword = env.ADMIN_PASSWORD;
  const adminUsername = env.ADMIN_USERNAME;

  if (!adminEmail || !adminEmail.includes("@")) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters long.");
  }
  if (adminPassword === "admin123456") {
    throw new Error("ADMIN_PASSWORD is set to a known default. Set a unique strong value in .env.");
  }

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log("Admin already exists, skipping seed.");
    return;
  }

  const usernameTaken = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (usernameTaken) {
    throw new Error(`ADMIN_USERNAME "${adminUsername}" is already taken.`);
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`Admin created: ${adminEmail} / ${adminPassword}`);

  const codes = Array.from({ length: 5 }, () => ({
    code: crypto.randomBytes(8).toString("hex"),
    createdById: admin.id,
  }));

  await prisma.inviteCode.createMany({ data: codes });

  const created = await prisma.inviteCode.findMany({
    where: { createdById: admin.id },
    select: { code: true },
  });

  console.log("Invite codes:");
  created.forEach((c) => console.log(`  ${c.code}`));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
