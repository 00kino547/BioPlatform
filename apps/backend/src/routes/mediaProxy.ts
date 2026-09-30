import { Router } from "express";
import { proxyExternalImage } from "../lib/mediaProxy.js";

const router = Router();

router.get("/proxy", proxyExternalImage);

export default router;
