import { type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { permissionsFor, hasPermission, type Permission } from "../lib/permissions.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { role: true },
  });
  if (!user || permissionsFor(user.role).length === 0) {
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
