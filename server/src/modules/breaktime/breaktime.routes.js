import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

import {
  getBreakTypes,
  createBreakType,
  updateBreakType,
  updateBreakTypeStatus,
  getBreaktimeReferences,
  getBreakSchedules,
  createBreakSchedule,
  updateBreakSchedule,
  updateBreakScheduleStatus,
} from "./breaktime.controller.js";

const router = Router();

// All breaktime management endpoints require an authenticated
// Admin or HR account.
router.use(authenticate, authorize("admin", "hr"));

// Dropdown references
router.get("/references", getBreaktimeReferences);

// Break Types
router.get("/types", getBreakTypes);
router.post("/types", createBreakType);
router.patch("/types/:id", updateBreakType);
router.patch("/types/:id/status", updateBreakTypeStatus);

// Break Schedules
router.get("/schedules", getBreakSchedules);
router.post("/schedules", createBreakSchedule);
router.patch("/schedules/:id", updateBreakSchedule);
router.patch("/schedules/:id/status", updateBreakScheduleStatus);

export default router;
