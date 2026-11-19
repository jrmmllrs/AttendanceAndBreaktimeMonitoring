import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

import {
  getDepartments,
  getDepartmentReferences,
  getDepartment,
  createDepartment,
  updateDepartment,
  updateDepartmentStatus,
} from "./department.controller.js";

const router = Router();

router.use(authenticate);

// Read access for management accounts.
router.get("/", authorize("admin", "hr"), getDepartments);
router.get("/references", authorize("admin", "hr"), getDepartmentReferences);
router.get("/:id", authorize("admin", "hr"), getDepartment);

// Write access.
router.post("/", authorize("admin", "hr"), createDepartment);
router.patch("/:id", authorize("admin", "hr"), updateDepartment);
router.patch("/:id/status", authorize("admin", "hr"), updateDepartmentStatus);

export default router;
