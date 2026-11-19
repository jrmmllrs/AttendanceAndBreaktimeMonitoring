import { Router } from "express";

import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

import {
  getEmployees,
  getEmployee,
  getEmployeeReferences,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  resetEmployeePin,
} from "./employee.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getEmployees);
router.get("/references", getEmployeeReferences);
router.get("/:id", getEmployee);

router.post("/", authorize("admin", "hr"), createEmployee);

router.patch("/:id", authorize("admin", "hr"), updateEmployee);

router.patch("/:id/status", authorize("admin", "hr"), updateEmployeeStatus);

router.patch("/:id/pin", authorize("admin", "hr"), resetEmployeePin);

export default router;
  