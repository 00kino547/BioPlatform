import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  checkDomainTxt,
  gateCustomDomainForUser,
  generateVerificationToken,
  validateDomain,
} from "../lib/customDomains.js";

const router = Router();

const domainSchema = z.object({ domain: z.string().min(1).max(300) });
const rootTargetSchema = z.object({ rootTarget: z.string().max(80).nullable() });

function serializeDomain(entry: {
  id: string;
  profileId: string;
  domain: string;
  status: string;
  verificationToken: string;
  verifiedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rootTarget: string | null;
  tlsStatus: string;
  tlsIssuedAt: Date | null;
  tlsExpiresAt: Date | null;
  tlsError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: entry.id,
    profileId: entry.profileId,
    domain: entry.domain,
    status: entry.status,
    verificationToken: entry.verificationToken,
    verifiedAt: entry.verifiedAt,
    approvedAt: entry.approvedAt,
    rejectedAt: entry.rejectedAt,
    rootTarget: entry.rootTarget,
    tlsStatus: entry.tlsStatus,
    tlsIssuedAt: entry.tlsIssuedAt,
    tlsExpiresAt: entry.tlsExpiresAt,
    tlsError: entry.tlsError,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

async function loadGateUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
}

router.get("/domain", async (req, res) => {
  const host = (req.hostname ?? "").toLowerCase().replace(/\.$/, "");
  const active = req.customDomain;
  const isSecure = req.secure || String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim() === "https";
  if (!active) {
    return res.json({ success: true, data: { active: false, host, slug: null, canonical: null } });
  }
  res.json({
    success: true,
    data: {
      active: true,
      host,
      slug: active.rootTarget ?? null,
      canonical: `${isSecure ? "https" : "http"}://${host}`,
    },
  });
});

router.get("/profiles/me/:profileId/domain", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({ where: { id: req.params.profileId, userId: req.userId! } });
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });
  const entry = await prisma.profileDomain.findUnique({ where: { profileId: profile.id } });
  res.json({ success: true, data: entry ? serializeDomain(entry) : null });
});

router.post("/profiles/me/:profileId/domain", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const user = await loadGateUser(req.userId!);
  if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });
  const gate = gateCustomDomainForUser(user);
  if (!gate.allowed) return res.status(403).json({ success: false, error: gate.reason });

  const parsed = domainSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid domain" });

  const domain = validateDomain(parsed.data.domain);
  if (!domain) {
    return res.status(400).json({ success: false, error: "Invalid domain. Use a plain hostname like example.com (no scheme, path, port, or www)." });
  }

  const profile = await prisma.profile.findFirst({ where: { id: req.params.profileId, userId: req.userId! } });
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });

  const existing = await prisma.profileDomain.findUnique({ where: { profileId: profile.id } });
  if (existing && existing.status !== "REJECTED") {
    return res.status(409).json({ success: false, error: `This profile already has a domain request (${existing.domain}).` });
  }

  const taken = await prisma.profileDomain.findUnique({ where: { domain } });
  if (taken && taken.profileId !== profile.id && taken.status !== "REJECTED") {
    return res.status(409).json({ success: false, error: "That domain is already in use." });
  }

  const token = generateVerificationToken();
  let entry;
  if (existing) {
    entry = await prisma.profileDomain.update({
      where: { id: existing.id },
      data: { domain, status: "PENDING_VERIFICATION", verificationToken: token, verifiedAt: null, approvedAt: null, rejectedAt: null, rootTarget: null },
    });
  } else if (taken) {
    entry = await prisma.profileDomain.update({
      where: { id: taken.id },
      data: { profileId: profile.id, status: "PENDING_VERIFICATION", verificationToken: token, verifiedAt: null, approvedAt: null, rejectedAt: null, rootTarget: null },
    });
  } else {
    entry = await prisma.profileDomain.create({
      data: { profileId: profile.id, domain, status: "PENDING_VERIFICATION", verificationToken: token },
    });
  }

  res.status(201).json({ success: true, data: serializeDomain(entry) });
});

router.post("/profiles/me/:profileId/domain/verify", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({ where: { id: req.params.profileId, userId: req.userId! } });
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });
  const entry = await prisma.profileDomain.findUnique({ where: { profileId: profile.id } });
  if (!entry) return res.status(404).json({ success: false, error: "No domain request for this profile." });
  if (entry.status !== "PENDING_VERIFICATION") {
    return res.status(400).json({ success: false, error: `Domain is ${entry.status}.` });
  }

  const verified = await checkDomainTxt(entry.domain, entry.verificationToken);
  if (!verified) {
    return res.status(400).json({
      success: false,
      error: `TXT record not found yet. Add a TXT record named _bioplatform.${entry.domain} with the value shown, then try again (DNS can take a few minutes to propagate).`,
    });
  }

  const updated = await prisma.profileDomain.update({
    where: { id: entry.id },
    data: { status: "VERIFIED", verifiedAt: new Date() },
  });
  res.json({ success: true, data: serializeDomain(updated) });
});

router.put("/profiles/me/:profileId/domain", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({ where: { id: req.params.profileId, userId: req.userId! } });
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });
  const entry = await prisma.profileDomain.findUnique({ where: { profileId: profile.id } });
  if (!entry) return res.status(404).json({ success: false, error: "No domain for this profile." });

  const parsed = rootTargetSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ success: false, error: "Invalid root target" });

  const rootTarget = parsed.data.rootTarget ? parsed.data.rootTarget.trim().toLowerCase() : null;
  if (rootTarget) {
    const target = await prisma.profile.findFirst({ where: { slug: rootTarget, isPublic: true } });
    if (!target) {
      return res.status(400).json({ success: false, error: "Root target must be a public profile slug." });
    }
  }

  const updated = await prisma.profileDomain.update({ where: { id: entry.id }, data: { rootTarget } });
  res.json({ success: true, data: serializeDomain(updated) });
});

router.delete("/profiles/me/:profileId/domain", requireAuth, async (req: Request<{ profileId: string }>, res) => {
  const profile = await prisma.profile.findFirst({ where: { id: req.params.profileId, userId: req.userId! } });
  if (!profile) return res.status(404).json({ success: false, error: "Profile not found" });
  const entry = await prisma.profileDomain.findUnique({ where: { profileId: profile.id } });
  if (entry) await prisma.profileDomain.delete({ where: { id: entry.id } });
  res.json({ success: true, data: null });
});

export default router;
