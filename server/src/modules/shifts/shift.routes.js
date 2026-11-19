import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

import {
  getShifts,
  getShiftReferences,
  getShiftAssignments,
  getShift,
  createShift,
  updateShift,
  updateShiftStatus,
  assignEmployeeShift,
  bulkAssignEmployeeShifts,
} from "./shift.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize("admin", "hr"));

// References and assignments must be declared before /:id.
router.get("/references", getShiftReferences);
router.get("/assignments", getShiftAssignments);
router.post("/assignments", assignEmployeeShift);
router.post("/assignments/bulk", bulkAssignEmployeeShifts);

router.get("/", getShifts);
router.post("/", createShift);

router.get("/:id", getShift);
router.patch("/:id", updateShift);
router.patch("/:id/status", updateShiftStatus);

export default router;
