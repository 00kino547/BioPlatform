import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";

export interface AuthPayload {
  userId: string;
  purpose?: "auth" | "twofactor" | "unlock";
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
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
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
}
