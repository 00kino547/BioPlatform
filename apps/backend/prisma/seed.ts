import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@bioplatform.com";
  const adminPassword = "admin123456";
  const adminUsername = "admin";

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log("Admin already exists, skipping seed.");
    return;
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
