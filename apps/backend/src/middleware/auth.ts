import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { requireCurrentConsent } from "./consent.js";

export interface AuthPayload {
  userId: string;
  purpose?: "auth" | "twofactor" | "unlock";
  /** authVersion embedded at issue time (A4). Absent on tokens issued before the feature → treated as 0. */
  av?: number;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Authenticates the bearer token and verifies the user still exists with the
 * same credential version. The user is loaded from the DB on every request so
 * a password change / admin reset (which bump `authVersion`) immediately
 * invalidates every previously issued session token for that user (A4).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Missing token" });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET) as AuthPayload;
    if (payload.purpose !== "auth") {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, authVersion: true },
    });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }

    // Compare the credential version stamped into the token against the user's
    // current value. Legacy tokens carry no `av` claim → treat as version 0,
    // which matches every user who never had their credentials bumped.
    const tokenVersion = payload.av ?? 0;
    if (tokenVersion !== user.authVersion) {
      return res.status(401).json({
        success: false,
        error: "Session expired — you signed in with a different set of credentials",
      });
    }

    req.userId = user.id;

    // Deemed-acceptance gate: an account that has not accepted the current
    // Terms of Service / Privacy Policy cannot use the platform. Runs here so
    // every authenticated route inherits it; the consent endpoints themselves
    // are exempt inside the middleware.
    return requireCurrentConsent(req, res, next);
  } catch {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
}
