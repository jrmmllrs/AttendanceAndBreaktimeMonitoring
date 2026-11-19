import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authenticate } from "../../middleware/authenticate.js";

import {
  processKioskAction,
  getKioskEmployeeStatus,
  getAvailableBreakSchedules,
  getActiveBreakMonitoring,
  getAttendanceRecords,
  getAttendanceEvents,
  processManagedAttendanceAction,
  processBulkManagedAttendanceAction,
  getAttendanceEmployees,
  saveBulkAttendance,
} from "./attendance.controller.js";

import {
  getManualAttendanceEmployees,
  saveManualAttendance,
} from "./manual-attendance.controller.js";

const router = Router();

const kioskLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const requireManagementRole = (req, res, next) => {
  const allowedRoles = ["admin", "hr", "supervisor"];

  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource.",
    });
  }

  next();
};

const requireAdminOrHr = (req, res, next) => {
  if (!req.user || !["admin", "hr"].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Admin or HR access is required.",
    });
  }

  next();
};

// Kiosk routes
router.post("/kiosk/action", kioskLimiter, processKioskAction);
router.post("/kiosk/status", kioskLimiter, getKioskEmployeeStatus);
router.post("/kiosk/break-schedules", kioskLimiter, getAvailableBreakSchedules);

// Management routes
router.get(
  "/management/employees",
  authenticate,
  requireManagementRole,
  getAttendanceEmployees,
);

router.post(
  "/management/action",
  authenticate,
  requireManagementRole,
  processManagedAttendanceAction,
);

router.post(
  "/management/bulk-action",
  authenticate,
  requireManagementRole,
  processBulkManagedAttendanceAction,
);

// Admin / HR monitoring routes
router.get(
  "/active-breaks",
  authenticate,
  requireManagementRole,
  getActiveBreakMonitoring,
);

router.get(
  "/management/manual-employees",
  authenticate,
  requireManagementRole,
  getManualAttendanceEmployees,
);

router.post(
  "/management/manual-entry",
  authenticate,
  requireManagementRole,
  saveManualAttendance,
);

router.post(
  "/management/bulk",
  authenticate,
  requireManagementRole,
  saveBulkAttendance,
);

router.get("/records", authenticate, requireAdminOrHr, getAttendanceRecords);

router.get("/events", authenticate, requireAdminOrHr, getAttendanceEvents);

export default router;
