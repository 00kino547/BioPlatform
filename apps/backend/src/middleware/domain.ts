import { type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { isAppHost, normalizeHostname } from "../lib/customDomains.js";

export interface ResolvedCustomDomain {
  id: string;
  profileId: string;
  domain: string;
  rootTarget: string | null;
  profile: { slug: string; isPublic: boolean };
}

declare global {
  namespace Express {
    interface Request {
      customDomain?: ResolvedCustomDomain | null;
    }
  }
}

export async function resolveCustomDomain(req: Request, _res: Response, next: NextFunction) {
  req.customDomain = null;
  const host = normalizeHostname(req.hostname ?? "");
  if (!host || isAppHost(host)) {
    return next();
  }
  try {
    const entry = await prisma.profileDomain.findFirst({
      where: { domain: host, status: "ACTIVE" },
      include: { profile: { select: { slug: true, isPublic: true } } },
    });
    if (entry) {
      req.customDomain = {
        id: entry.id,
        profileId: entry.profileId,
        domain: entry.domain,
        rootTarget: entry.rootTarget,
        profile: entry.profile,
      };
    }
  } catch (error) {
    console.error("resolveCustomDomain:", error);
  }
  next();
}
