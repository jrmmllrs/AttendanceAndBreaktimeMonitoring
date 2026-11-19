import { Router } from "express";

import authRoutes from "./auth.routes.js";
import employeeRoutes from "../modules/employees/employee.routes.js";
import departmentRoutes from "../modules/departments/department.routes.js";
import shiftRoutes from "../modules/shifts/shift.routes.js";
import breaktimeRoutes from "../modules/breaktime/breaktime.routes.js";
import attendanceRoutes from "../modules/attendance/attendance.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import monitoringRoutes from "../modules/monitoring/monitoring.routes.js";


const router = Router();

router.use("/auth", authRoutes);
router.use("/employees", employeeRoutes);
router.use("/departments", departmentRoutes);
router.use("/shifts", shiftRoutes);
router.use("/breaktime", breaktimeRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/monitoring", monitoringRoutes);

export default router;
