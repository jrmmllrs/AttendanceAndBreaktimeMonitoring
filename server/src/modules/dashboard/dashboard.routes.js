import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { getDashboardSummary } from "./dashboard.controller.js";

const router = Router();

const requireManagementRole = (req, res, next) => {
  if (!req.user || !["admin", "hr", "supervisor"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource.",
    });
  }

  next();
};

router.get(
  "/summary",
  authenticate,
  requireManagementRole,
  getDashboardSummary,
);

export default router;
