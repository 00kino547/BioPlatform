import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { getEnv } from "../src/config/env.js";
import { ALL_PERMISSIONS, SYSTEM_ROLE_SLUGS } from "../src/lib/permissions.js";

const prisma = new PrismaClient();

const SYSTEM_BADGES = [
  { slug: "dev", label: "Developer", color: "#a78bfa", icon: "Code" },
  { slug: "owner", label: "Owner", color: "#fbbf24", icon: "Crown" },
  { slug: "staff", label: "Staff", color: "#34d399", icon: "Wrench" },
  { slug: "moderator", label: "Moderator", color: "#38bdf8", icon: "Shield" },
  { slug: "verified", label: "Verified", color: "#4ade80", icon: "BadgeCheck" },
  { slug: "premium", label: "Premium", color: "#e879f9", icon: "Gem" },
  { slug: "enterprise", label: "Enterprise", color: "#fb923c", icon: "Building2" },
] as const;

async function ensureSystemRoles() {
  const upserts = [
    {
      slug: SYSTEM_ROLE_SLUGS.ADMIN,
      name: "Admin",
      description: "Full platform access",
      permissions: [...ALL_PERMISSIONS],
    },
    {
      slug: SYSTEM_ROLE_SLUGS.USER,
      name: "User",
      description: "Standard member",
      permissions: [PERMISSIONS.PROFILES_CUSTOM_DOMAIN],
    },
  ];

  for (const role of upserts) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name, description: role.description, permissions: role.permissions, isSystem: true },
      create: { ...role, isSystem: true },
    });
  }
}

async function ensureSystemBadges() {
  for (const badge of SYSTEM_BADGES) {
    await prisma.badge.upsert({
      where: { slug: badge.slug },
      update: { ...badge, isSystem: true },
      create: { ...badge, isSystem: true },
    });
  }
}

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

  await ensureSystemRoles();
  await ensureSystemBadges();

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
  const adminRole = await prisma.role.findUnique({ where: { slug: SYSTEM_ROLE_SLUGS.ADMIN } });
  if (!adminRole) {
    throw new Error("Admin role not found after seeding roles.");
  }

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      email: adminEmail,
      passwordHash,
      roleId: adminRole.id,
    },
  });

  console.log(`Admin created: ${adminEmail}`);

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
