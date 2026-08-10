import { type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  permissionsFor,
  hasPermission,
  hasApiLevel,
  effectiveApiLevel,
  ADMIN_GATE_PERMISSIONS,
  type ApiLevel,
  type Permission,
} from "../lib/permissions.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { role: true },
  });
  if (!user || !permissionsFor(user.role).some((p) => ADMIN_GATE_PERMISSIONS.has(p as Permission))) {
    return res.status(403).json({ success: false, error: "Admin access required" });
  }
  next();
}

export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: { role: true },
    });
    if (!user || !hasPermission(user.role, permission)) {
      return res.status(403).json({ success: false, error: "Insufficient permissions" });
    }
    next();
  };
}

export function requireApiLevel(level: ApiLevel) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: { role: true },
    });
    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    if (!hasApiLevel(user.role, user.tier, level)) {
      return res.status(403).json({
        success: false,
        error: `This endpoint requires the ${level} API tier`,
        data: { required: level, apiLevel: effectiveApiLevel(user.role, user.tier) },
      });
    }
    next();
  };
}
