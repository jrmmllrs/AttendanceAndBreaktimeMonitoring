import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { getLiveMonitoring } from "./monitoring.controller.js";

const router = Router();

const requireManagementRole = (req, res, next) => {
  if (!req.user || !["admin", "hr", "supervisor"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access live monitoring.",
    });
  }

  next();
};

router.get("/live", authenticate, requireManagementRole, getLiveMonitoring);

export default router;
