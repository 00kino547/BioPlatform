import { type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ success: false, error: "Admin access required" });
  }
  next();
}
