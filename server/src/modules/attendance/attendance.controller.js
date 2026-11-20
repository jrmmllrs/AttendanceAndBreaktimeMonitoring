import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../../config/supabase.js";

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
};

const safeEmployee = (employee) => ({
  id: employee.id,
  employee_number: employee.employee_number,
  first_name: employee.first_name,
  last_name: employee.last_name,
  department_id: employee.department_id,
  employment_status: employee.employment_status,
});

/* =========================================================
   KIOSK EMPLOYEE VERIFICATION
========================================================= */

async function verifyKioskEmployee(employeeNumber, pin) {
  if (!employeeNumber || !pin) {
    return {
      error: "Employee ID and PIN are required.",
      status: 400,
    };
  }

  const normalizedNumber = String(employeeNumber).trim();
  const normalizedPin = String(pin).trim();

  if (!normalizedNumber || !/^\d{4,8}$/.test(normalizedPin)) {
    return {
      error: "Invalid Employee ID or PIN.",
      status: 401,
    };
  }

  const { data: employee, error } = await supabaseAdmin
    .from("employees")
    .select(
      `
      id,
      employee_number,
      first_name,
      last_name,
      department_id,
      employment_status,
      pin_hash,
      failed_pin_attempts,
      locked_until
    `,
    )
    .eq("employee_number", normalizedNumber)
    .maybeSingle();

  if (error) {
    console.error("Kiosk employee lookup error:", error);

    return {
      error: "Unable to verify employee credentials.",
      status: 500,
    };
  }

  if (!employee || employee.employment_status !== "active") {
    return {
      error: "Invalid Employee ID or PIN.",
      status: 401,
    };
  }

  if (employee.locked_until) {
    const lockedUntil = new Date(employee.locked_until);

    if (lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (lockedUntil.getTime() - Date.now()) / 60000,
      );

      return {
        error: `Too many failed attempts. Try again in approximately ${remainingMinutes} minute(s).`,
        status: 423,
      };
    }
  }

  const pinMatches = await bcrypt.compare(normalizedPin, employee.pin_hash);

  if (!pinMatches) {
    const nextAttempts = Number(employee.failed_pin_attempts || 0) + 1;

    const shouldLock = nextAttempts >= MAX_PIN_ATTEMPTS;

    const updatePayload = {
      failed_pin_attempts: shouldLock ? 0 : nextAttempts,
      locked_until: shouldLock
        ? new Date(Date.now() + PIN_LOCK_MINUTES * 60000).toISOString()
        : null,
    };

    const { error: updateError } = await supabaseAdmin
      .from("employees")
      .update(updatePayload)
      .eq("id", employee.id);

    if (updateError) {
      console.error("PIN attempt update error:", updateError);

      return {
        error: "Unable to verify employee credentials.",
        status: 500,
      };
    }

    if (shouldLock) {
      return {
        error: `Too many failed attempts. Your PIN is locked for ${PIN_LOCK_MINUTES} minutes.`,
        status: 423,
      };
    }

    return {
      error: "Invalid Employee ID or PIN.",
      status: 401,
    };
  }

  const { error: resetError } = await supabaseAdmin
    .from("employees")
    .update({
      failed_pin_attempts: 0,
      locked_until: null,
    })
    .eq("id", employee.id);

  if (resetError) {
    console.error("PIN reset error:", resetError);

    return {
      error: "Unable to complete employee verification.",
      status: 500,
    };
  }

  return { employee };
}

/* =========================================================
   ATTENDANCE HELPERS
========================================================= */

async function getOpenAttendance(employeeId) {
  const { data, error } = await supabaseAdmin
    .from("attendance_records")
    .select(
      `
      id,
      employee_id,
      shift_assignment_id,
      work_date,
      scheduled_start_at,
      scheduled_end_at,
      clock_in_at,
      clock_out_at,
      status,
      late_minutes,
      total_worked_minutes,
      total_break_minutes,
      excess_break_minutes
    `,
    )
    .eq("employee_id", employeeId)
    .is("clock_out_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function getActiveBreak(attendanceId) {
  const { data, error } = await supabaseAdmin
    .from("break_records")
    .select(
      `
      id,
      break_schedule_id,
      break_type_id,
      break_name,
      actual_start_at,
      allowed_duration_minutes,
      actual_duration_minutes,
      excess_minutes,
      status
    `,
    )
    .eq("attendance_id", attendanceId)
    .is("actual_end_at", null)
    .maybeSingle();

  if (error) throw error;

  return data;
}

/* =========================================================
   KIOSK ACTION
   POST /api/attendance/kiosk/action
========================================================= */

export const processKioskAction = async (req, res) => {
  try {
    const { employee_number, pin, action, break_schedule_id, idempotency_key } =
      req.body || {};

    const allowedActions = [
      "clock_in",
      "clock_out",
      "break_start",
      "break_end",
    ];

    if (!allowedActions.includes(action)) {
      return sendError(res, 400, "Invalid attendance action.");
    }

    if (action === "break_start" && !break_schedule_id) {
      return sendError(res, 400, "Please select a break schedule.");
    }

    const verification = await verifyKioskEmployee(employee_number, pin);

    if (verification.error) {
      return sendError(res, verification.status, verification.error);
    }

    const employee = verification.employee;

    const { data, error } = await supabaseAdmin.rpc(
      "process_attendance_action",
      {
        p_employee_id: employee.id,
        p_action: action,
        p_break_schedule_id: break_schedule_id || null,
        p_idempotency_key: idempotency_key || null,
        p_source: "kiosk",
        p_kiosk_device_id: null,
        p_ip_address: getClientIp(req),
        p_user_agent: req.headers["user-agent"] || null,
        p_created_by: null,
        p_notes: null,
      },
    );

    if (error) {
      console.error("Attendance RPC error:", error);

      return sendError(
        res,
        400,
        error.message || "Unable to process attendance action.",
      );
    }

    if (data?.success === false) {
      return sendError(
        res,
        400,
        data.message || "Attendance action was not completed.",
      );
    }

    return res.json({
      success: true,
      message: data?.message || "Attendance action completed.",
      employee: safeEmployee(employee),
      result: data,
    });
  } catch (error) {
    console.error("processKioskAction error:", error);

    return sendError(res, 500, "Internal server error.");
  }
};

/* =========================================================
   KIOSK STATUS
   POST /api/attendance/kiosk/status
========================================================= */

export const getKioskEmployeeStatus = async (req, res) => {
  try {
    const { employee_number, pin } = req.body || {};

    const verification = await verifyKioskEmployee(employee_number, pin);

    if (verification.error) {
      return sendError(res, verification.status, verification.error);
    }

    const employee = verification.employee;

    const attendance = await getOpenAttendance(employee.id);

    if (!attendance) {
      return res.json({
        success: true,
        employee: safeEmployee(employee),
        attendance: null,
        active_break: null,
        current_state: "off_duty",
      });
    }

    const activeBreak = await getActiveBreak(attendance.id);

    const currentState = activeBreak ? "on_break" : "working";

    return res.json({
      success: true,
      employee: safeEmployee(employee),
      attendance,
      active_break: activeBreak,
      current_state: currentState,
    });
  } catch (error) {
    console.error("getKioskEmployeeStatus error:", error);

    return sendError(res, 500, "Unable to retrieve attendance status.");
  }
};

/* =========================================================
   KIOSK AVAILABLE BREAK SCHEDULES
   POST /api/attendance/kiosk/break-schedules
========================================================= */

export const getAvailableBreakSchedules = async (req, res) => {
  try {
    const { employee_number, pin } = req.body || {};

    const verification = await verifyKioskEmployee(employee_number, pin);

    if (verification.error) {
      return sendError(res, verification.status, verification.error);
    }

    const employee = verification.employee;

    const attendance = await getOpenAttendance(employee.id);

    if (!attendance) {
      return sendError(res, 400, "You must clock in before starting a break.");
    }

    if (await getActiveBreak(attendance.id)) {
      return sendError(res, 400, "You already have an active break.");
    }

    if (!attendance.shift_assignment_id) {
      return sendError(
        res,
        400,
        "No shift assignment is associated with this attendance.",
      );
    }

    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from("employee_shift_assignments")
      .select("id, shift_id")
      .eq("id", attendance.shift_assignment_id)
      .maybeSingle();

    if (assignmentError) throw assignmentError;

    if (!assignment) {
      return sendError(res, 400, "Shift assignment was not found.");
    }

    let scheduleQuery = supabaseAdmin
      .from("break_schedules")
      .select(
        `
        id,
        shift_id,
        break_type_id,
        name,
        sequence_number,
        duration_minutes,
        department_id,
        max_occurrences_per_shift
      `,
      )
      .eq("shift_id", assignment.shift_id)
      .eq("is_active", true)
      .order("sequence_number", { ascending: true });

    if (employee.department_id) {
      scheduleQuery = scheduleQuery.or(
        `department_id.is.null,department_id.eq.${employee.department_id}`,
      );
    } else {
      scheduleQuery = scheduleQuery.is("department_id", null);
    }

    const { data: schedules, error: scheduleError } = await scheduleQuery;

    if (scheduleError) throw scheduleError;

    const scheduleIds = (schedules || []).map((item) => item.id);

    const breakTypeIds = [
      ...new Set(
        (schedules || []).map((item) => item.break_type_id).filter(Boolean),
      ),
    ];

    let breakTypes = [];

    if (breakTypeIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("break_types")
        .select(
          `
          id,
          name,
          is_paid,
          allowed_duration_minutes
        `,
        )
        .in("id", breakTypeIds)
        .eq("is_active", true);

      if (error) throw error;

      breakTypes = data || [];
    }

    let usedRecords = [];

    if (scheduleIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("break_records")
        .select("break_schedule_id")
        .eq("attendance_id", attendance.id)
        .in("break_schedule_id", scheduleIds);

      if (error) throw error;

      usedRecords = data || [];
    }

    const typeMap = new Map(breakTypes.map((item) => [item.id, item]));

    const usageMap = new Map();

    for (const record of usedRecords) {
      const id = record.break_schedule_id;

      if (!id) continue;

      usageMap.set(id, (usageMap.get(id) || 0) + 1);
    }

    const availableSchedules = (schedules || [])
      .filter((schedule) => typeMap.has(schedule.break_type_id))
      .map((schedule) => {
        const usedCount = usageMap.get(schedule.id) || 0;
        const maximum = schedule.max_occurrences_per_shift;

        return {
          ...schedule,
          break_type: typeMap.get(schedule.break_type_id),
          used_count: usedCount,
          remaining_count:
            maximum === null ? null : Math.max(0, maximum - usedCount),
          is_available: maximum === null || usedCount < maximum,
        };
      })
      .filter((schedule) => schedule.is_available);

    return res.json({
      success: true,
      attendance_id: attendance.id,
      schedules: availableSchedules,
    });
  } catch (error) {
    console.error("getAvailableBreakSchedules error:", error);

    return sendError(res, 500, "Unable to load break schedules.");
  }
};

/* =========================================================
   ACTIVE BREAK MONITORING
   GET /api/attendance/active-breaks
========================================================= */

export const getActiveBreakMonitoring = async (req, res) => {
  try {
    const { department_id, search } = req.query;

    let allowedDepartmentIds = null;

    if (req.user?.role === "supervisor") {
      const { data: departments, error: departmentError } = await supabaseAdmin
        .from("departments")
        .select("id")
        .eq("supervisor_profile_id", req.user.id)
        .eq("is_active", true);

      if (departmentError) throw departmentError;

      allowedDepartmentIds = (departments || []).map(
        (department) => department.id,
      );

      if (allowedDepartmentIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          total: 0,
          server_time: new Date().toISOString(),
        });
      }

      if (
        department_id &&
        department_id !== "all" &&
        !allowedDepartmentIds.includes(department_id)
      ) {
        return sendError(
          res,
          403,
          "You do not have access to this department.",
        );
      }
    }

    let query = supabaseAdmin
      .from("active_break_monitoring")
      .select("*")
      .order("actual_start_at", { ascending: true });

    if (department_id && department_id !== "all") {
      query = query.eq("department_id", department_id);
    }

    if (allowedDepartmentIds) {
      query = query.in("department_id", allowedDepartmentIds);
    }

    const { data, error } = await query;

    if (error) throw error;

    let result = data || [];

    if (search && String(search).trim()) {
      const term = String(search).trim().toLowerCase();

      result = result.filter((item) => {
        const fullName = [item.first_name, item.last_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          String(item.employee_number || "")
            .toLowerCase()
            .includes(term) ||
          fullName.includes(term) ||
          String(item.break_name || "")
            .toLowerCase()
            .includes(term) ||
          String(item.department_name || "")
            .toLowerCase()
            .includes(term)
        );
      });
    }

    return res.json({
      success: true,
      data: result,
      total: result.length,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getActiveBreakMonitoring error:", error);

    return sendError(
      res,
      500,
      error.message || "Unable to load active break monitoring.",
    );
  }
};

/* =========================================================
   ATTENDANCE RECORDS
   GET /api/attendance/records
========================================================= */

export const getAttendanceRecords = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );

    const from = (page - 1) * limit;

    const { date_from, date_to, status, department_id, search } = req.query;

    let employeeIds = null;

    if (search && String(search).trim()) {
      const term = String(search).trim();

      const { data: employees, error: employeeError } = await supabaseAdmin
        .from("employees")
        .select("id")
        .or(
          `employee_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
        );

      if (employeeError) throw employeeError;

      employeeIds = (employees || []).map((item) => item.id);

      if (employeeIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }
    }

    let query = supabaseAdmin
      .from("attendance_records")
      .select("*", { count: "exact" })
      .order("work_date", { ascending: false })
      .order("clock_in_at", { ascending: false })
      .range(from, from + limit - 1);

    if (date_from) {
      query = query.gte("work_date", date_from);
    }

    if (date_to) {
      query = query.lte("work_date", date_to);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (employeeIds) {
      query = query.in("employee_id", employeeIds);
    }

    if (department_id && department_id !== "all") {
      const { data: employees, error: departmentError } = await supabaseAdmin
        .from("employees")
        .select("id")
        .eq("department_id", department_id);

      if (departmentError) throw departmentError;

      const departmentEmployeeIds = (employees || []).map((item) => item.id);

      if (departmentEmployeeIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }

      query = query.in("employee_id", departmentEmployeeIds);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const records = data || [];

    const recordEmployeeIds = [
      ...new Set(records.map((item) => item.employee_id)),
    ];

    let employeeMap = new Map();

    if (recordEmployeeIds.length > 0) {
      const { data: employees, error: employeesError } = await supabaseAdmin
        .from("employees")
        .select(
          `
            id,
            employee_number,
            first_name,
            middle_name,
            last_name,
            department_id
          `,
        )
        .in("id", recordEmployeeIds);

      if (employeesError) throw employeesError;

      employeeMap = new Map((employees || []).map((item) => [item.id, item]));
    }

    const enrichedRecords = records.map((record) => ({
      ...record,
      employee: employeeMap.get(record.employee_id) || null,
    }));

    return res.json({
      success: true,
      data: enrichedRecords,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("getAttendanceRecords error:", error);

    return sendError(res, 500, "Unable to load attendance records.");
  }
};

/* =========================================================
   ATTENDANCE EVENTS
   GET /api/attendance/events
========================================================= */

export const getAttendanceEvents = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 50),
    );

    const from = (page - 1) * limit;

    const { attendance_id, employee_id } = req.query;

    if (!attendance_id && !employee_id) {
      return sendError(
        res,
        400,
        "Please provide an attendance_id or employee_id.",
      );
    }

    let query = supabaseAdmin
      .from("attendance_events")
      .select(
        `
        id,
        attendance_id,
        employee_id,
        event_type,
        event_at,
        source,
        notes,
        created_by
      `,
        { count: "exact" },
      )
      .order("event_at", { ascending: false })
      .range(from, from + limit - 1);

    if (attendance_id) {
      query = query.eq("attendance_id", attendance_id);
    }

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return res.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("getAttendanceEvents error:", error);

    return sendError(res, 500, "Unable to load attendance events.");
  }
};

/* =========================================================
   MANAGEMENT PERMISSIONS
========================================================= */

async function canManageEmployee(user, employee) {
  if (!user || !employee) return false;

  if (user.role === "admin" || user.role === "hr") {
    return true;
  }

  if (user.role !== "supervisor" || !employee.department_id) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id")
    .eq("id", employee.department_id)
    .eq("supervisor_profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;

  return Boolean(data);
}

/* =========================================================
   SHARED MANAGEMENT ACTION HANDLER
========================================================= */

async function executeManagedAction({
  employeeId,
  action,
  breakScheduleId = null,
  notes = null,
  user,
}) {
  const allowedActions = ["clock_in", "clock_out", "break_start", "break_end"];

  // Validate action
  if (!allowedActions.includes(action)) {
    const error = new Error("Invalid attendance action.");
    error.status = 400;
    throw error;
  }

  if (!employeeId) {
    const error = new Error("Employee is required.");
    error.status = 400;
    throw error;
  }

  if (action === "break_start" && !breakScheduleId) {
    const error = new Error("Please select a break schedule.");
    error.status = 400;
    throw error;
  }

  // 1. Fetch employee BEFORE using employee.id
  const { data: employee, error: employeeError } = await supabaseAdmin
    .from("employees")
    .select(
      `
        id,
        employee_number,
        first_name,
        last_name,
        department_id,
        employment_status
      `,
    )
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError) throw employeeError;

  if (!employee || employee.employment_status !== "active") {
    const error = new Error("Employee was not found or is not active.");
    error.status = 404;
    throw error;
  }

  // 2. Validate management permissions
  const permitted = await canManageEmployee(user, employee);

  if (!permitted) {
    const error = new Error(
      "You do not have permission to manage this employee.",
    );
    error.status = 403;
    throw error;
  }

  // 3. Management break actions
  if (action === "break_start" || action === "break_end") {
    const manilaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // Diagnostic query to compare with the RPC lookup
    const { data: attendanceCheck, error: attendanceCheckError } =
      await supabaseAdmin
        .from("attendance_records")
        .select(
          `
        id,
        employee_id,
        work_date,
        status,
        shift_assignment_id,
        clock_out_at
      `,
        )
        .eq("employee_id", employee.id)
        .eq("work_date", manilaDate)
        .eq("status", "present")
        .not("shift_assignment_id", "is", null)
        .is("clock_out_at", null)
        .maybeSingle();

    console.log("========== MANAGED BREAK DEBUG ==========");
    console.log("Action:", action);
    console.log("Employee ID from request:", employeeId);
    console.log("Employee ID from database:", employee.id);
    console.log("Employee number:", employee.employee_number);
    console.log("Break schedule ID:", breakScheduleId);
    console.log("Manila date:", manilaDate);
    console.log("Attendance pre-check:", attendanceCheck);
    console.log("Attendance query error:", attendanceCheckError);
    console.log("==========================================");

    if (attendanceCheckError) {
      console.error(
        "Managed break attendance pre-check error:",
        attendanceCheckError,
      );
    }

    // Dedicated management break RPC
    const { data, error } = await supabaseAdmin.rpc(
      "process_managed_break_action",
      {
        p_employee_id: employee.id,
        p_action: action,
        p_break_schedule_id: breakScheduleId,
        p_idempotency_key: null,
        p_created_by: user.id,
        p_notes: notes,
      },
    );

    if (error) {
      console.error("Managed break RPC error:", error);

      const rpcError = new Error(
        error.message || "Unable to process break action.",
      );

      rpcError.status = 400;
      throw rpcError;
    }

    if (data?.success === false) {
      const rpcError = new Error(
        data.message || "Break action was not completed.",
      );

      rpcError.status = 400;
      throw rpcError;
    }

    return {
      employee: safeEmployee(employee),
      result: data,
    };
  }

  // 4. Original attendance RPC for clock-in/clock-out
  const { data, error } = await supabaseAdmin.rpc("process_attendance_action", {
    p_employee_id: employee.id,
    p_action: action,
    p_break_schedule_id: null,
    p_idempotency_key: null,
    p_source: "admin",
    p_kiosk_device_id: null,
    p_ip_address: null,
    p_user_agent: null,
    p_created_by: user.id,
    p_notes: notes,
  });

  if (error) {
    console.error("Managed attendance RPC error:", error);

    const rpcError = new Error(
      error.message || "Unable to process attendance action.",
    );

    rpcError.status = 400;
    throw rpcError;
  }

  if (data?.success === false) {
    const rpcError = new Error(
      data.message || "Attendance action was not completed.",
    );

    rpcError.status = 400;
    throw rpcError;
  }

  return {
    employee: safeEmployee(employee),
    result: data,
  };
}

/* =========================================================
   SINGLE MANAGEMENT ACTION
   POST /api/attendance/management/action
========================================================= */

export const processManagedAttendanceAction = async (req, res) => {
  try {
    const { employee_id, action, break_schedule_id, notes } = req.body || {};

    console.log("MANAGEMENT ACTION REQUEST:", {
      employee_id,
      action,
      break_schedule_id,
      user_id: req.user?.id,
      role: req.user?.role,
    });

    const result = await executeManagedAction({
      employeeId: employee_id,
      action,
      breakScheduleId: break_schedule_id || null,
      notes: notes || null,
      user: req.user,
    });

    return res.json({
      success: true,
      message: result.result?.message || "Attendance action completed.",
      ...result,
    });
  } catch (error) {
    console.error("processManagedAttendanceAction error:", error);

    return sendError(
      res,
      error.status || 500,
      error.status ? error.message : "Unable to process attendance action.",
    );
  }
};

/* =========================================================
   BULK MANAGEMENT ACTION
   POST /api/attendance/management/bulk-action
========================================================= */

export const processBulkManagedAttendanceAction = async (req, res) => {
  try {
    const { employee_ids, action, break_schedule_id, notes } = req.body || {};

    if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
      return sendError(res, 400, "Please select at least one employee.");
    }

    if (employee_ids.length > 100) {
      return sendError(
        res,
        400,
        "You can process up to 100 employees at a time.",
      );
    }

    const uniqueEmployeeIds = [
      ...new Set(
        employee_ids.filter((id) => typeof id === "string" && id.trim() !== ""),
      ),
    ];

    if (uniqueEmployeeIds.length === 0) {
      return sendError(res, 400, "Please provide valid employee IDs.");
    }

    const results = [];

    for (const employeeId of uniqueEmployeeIds) {
      try {
        // Reuse the top-level helper.
        // Do not declare another executeManagedAction here.
        const result = await executeManagedAction({
          employeeId,
          action,
          breakScheduleId: break_schedule_id || null,
          notes: notes || null,
          user: req.user,
        });

        results.push({
          employee_id: employeeId,
          success: true,
          employee: result.employee,
          result: result.result,
        });
      } catch (error) {
        console.error(
          `Bulk attendance action failed for employee ${employeeId}:`,
          error,
        );

        results.push({
          employee_id: employeeId,
          success: false,
          message: error.message || "Unable to process attendance action.",
        });
      }
    }

    const succeeded = results.filter((item) => item.success).length;

    const failed = results.length - succeeded;

    return res.status(failed > 0 && succeeded === 0 ? 400 : 200).json({
      success: failed === 0,
      message: `${succeeded} employee(s) processed${
        failed ? `; ${failed} failed` : " successfully"
      }.`,
      summary: {
        total: results.length,
        succeeded,
        failed,
      },
      results,
    });
  } catch (error) {
    console.error("processBulkManagedAttendanceAction error:", error);

    return sendError(res, 500, "Unable to process bulk attendance action.");
  }
};

/* =========================================================
   ATTENDANCE EMPLOYEES
   GET /api/attendance/management/employees
========================================================= */

export const getAttendanceEmployees = async (req, res) => {
  try {
    const { department_id, search, status } = req.query;

    let employeeQuery = supabaseAdmin
      .from("employees")
      .select(
        `
        id,
        employee_number,
        first_name,
        middle_name,
        last_name,
        department_id,
        employment_status
      `,
      )
      .eq("employment_status", "active")
      .order("employee_number", {
        ascending: true,
      });

    if (department_id && department_id !== "all") {
      employeeQuery = employeeQuery.eq("department_id", department_id);
    }

    if (search && String(search).trim()) {
      const term = String(search).trim().replace(/[(),]/g, " ");

      employeeQuery = employeeQuery.or(
        `employee_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
      );
    }

    const { data: employees, error: employeeError } = await employeeQuery;

    if (employeeError) throw employeeError;

    let visibleEmployees = employees || [];

    if (req.user?.role === "supervisor") {
      const { data: assignedDepartments, error: departmentsError } =
        await supabaseAdmin
          .from("departments")
          .select("id")
          .eq("supervisor_profile_id", req.user.id)
          .eq("is_active", true);

      if (departmentsError) throw departmentsError;

      const allowedDepartmentIds = new Set(
        (assignedDepartments || []).map((item) => item.id),
      );

      visibleEmployees = visibleEmployees.filter((employee) =>
        allowedDepartmentIds.has(employee.department_id),
      );
    }

    const employeeIds = visibleEmployees.map((employee) => employee.id);

    if (employeeIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        total: 0,
      });
    }

    const { data: attendanceRows, error: attendanceError } = await supabaseAdmin
      .from("attendance_records")
      .select(
        `
        id,
        employee_id,
        shift_assignment_id,
        work_date,
        scheduled_start_at,
        scheduled_end_at,
        clock_in_at,
        clock_out_at,
        status,
        late_minutes,
        total_worked_minutes,
        total_break_minutes,
        excess_break_minutes
      `,
      )
      .in("employee_id", employeeIds)
      .is("clock_out_at", null)
      .order("created_at", {
        ascending: false,
      });

    if (attendanceError) throw attendanceError;

    const openAttendanceMap = new Map();

    for (const attendance of attendanceRows || []) {
      if (!openAttendanceMap.has(attendance.employee_id)) {
        openAttendanceMap.set(attendance.employee_id, attendance);
      }
    }

    const attendanceIds = [
      ...new Set([...openAttendanceMap.values()].map((item) => item.id)),
    ];

    let activeBreakMap = new Map();

    if (attendanceIds.length > 0) {
      const { data: activeBreaks, error: breakError } = await supabaseAdmin
        .from("break_records")
        .select(
          `
          id,
          attendance_id,
          break_name,
          actual_start_at,
          allowed_duration_minutes
        `,
        )
        .in("attendance_id", attendanceIds)
        .is("actual_end_at", null);

      if (breakError) throw breakError;

      activeBreakMap = new Map(
        (activeBreaks || []).map((item) => [item.attendance_id, item]),
      );
    }

    const departmentIds = [
      ...new Set(
        visibleEmployees
          .map((employee) => employee.department_id)
          .filter(Boolean),
      ),
    ];

    let departmentMap = new Map();

    if (departmentIds.length > 0) {
      const { data: departments, error: departmentError } = await supabaseAdmin
        .from("departments")
        .select("id, name")
        .in("id", departmentIds);

      if (departmentError) throw departmentError;

      departmentMap = new Map(
        (departments || []).map((item) => [item.id, item]),
      );
    }

    const result = visibleEmployees.map((employee) => {
      const attendance = openAttendanceMap.get(employee.id) || null;

      const activeBreak = attendance
        ? activeBreakMap.get(attendance.id) || null
        : null;

      const currentState = !attendance
        ? "off_duty"
        : activeBreak
          ? "on_break"
          : "working";

      return {
        ...employee,
        department: departmentMap.get(employee.department_id) || null,
        attendance,
        active_break: activeBreak,
        current_state: currentState,
      };
    });

    const filtered =
      status && status !== "all"
        ? result.filter((employee) => employee.current_state === status)
        : result;

    return res.json({
      success: true,
      data: filtered,
      total: filtered.length,
    });
  } catch (error) {
    console.error("getAttendanceEmployees error:", error);

    return sendError(
      res,
      500,
      "Unable to load employees for attendance management.",
    );
  }
};

/* =========================================================
   SAVE BULK ATTENDANCE
   POST /api/attendance/management/bulk
========================================================= */

export const saveBulkAttendance = async (req, res) => {
  try {
    const { work_date, entries } = req.body || {};
    const user = req.user;

    // Validate date
    if (!work_date || !/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
      return sendError(res, 400, "A valid work date is required (YYYY-MM-DD).");
    }

    // Validate entries
    if (!Array.isArray(entries) || entries.length === 0) {
      return sendError(res, 400, "Select at least one employee.");
    }

    const allowedStatuses = ["present", "absent"];

    const employeeIds = [];
    const normalizedEntries = [];

    for (const entry of entries) {
      const employeeId = entry?.employee_id;
      const status = String(entry?.status || "").toLowerCase();

      if (!employeeId || !allowedStatuses.includes(status)) {
        return sendError(
          res,
          400,
          "Each entry requires an employee ID and Present or Absent status.",
        );
      }

      if (employeeIds.includes(employeeId)) {
        return sendError(
          res,
          400,
          "Duplicate employee entries are not allowed.",
        );
      }

      employeeIds.push(employeeId);

      normalizedEntries.push({
        employee_id: employeeId,
        status,
      });
    }

    // Confirm employees exist and are active
    const { data: employees, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, department_id, employment_status")
      .in("id", employeeIds);

    if (employeeError) throw employeeError;

    if (!employees || employees.length !== employeeIds.length) {
      return sendError(
        res,
        400,
        "One or more selected employees do not exist.",
      );
    }

    if (employees.some((employee) => employee.employment_status !== "active")) {
      return sendError(
        res,
        400,
        "Only active employees can have attendance recorded.",
      );
    }

    // Supervisor department restrictions
    if (user.role === "supervisor") {
      const { data: departments, error: departmentError } = await supabaseAdmin
        .from("departments")
        .select("id")
        .eq("supervisor_profile_id", user.id)
        .eq("is_active", true);

      if (departmentError) throw departmentError;

      const allowedDepartmentIds = new Set(
        (departments || []).map((department) => department.id),
      );

      const unauthorizedEmployee = employees.some(
        (employee) =>
          !employee.department_id ||
          !allowedDepartmentIds.has(employee.department_id),
      );

      if (unauthorizedEmployee) {
        return sendError(
          res,
          403,
          "You can only record attendance for employees in your assigned departments.",
        );
      }
    }

    // Save through PostgreSQL function
    const { data, error } = await supabaseAdmin.rpc("save_bulk_attendance", {
      p_work_date: work_date,
      p_entries: normalizedEntries,
      p_recorded_by: user.id,
    });

    if (error) {
      console.error("saveBulkAttendance RPC error:", error);

      return sendError(res, 400, error.message || "Unable to save attendance.");
    }

    return res.status(200).json({
      success: true,  
      message: data?.message || "Attendance saved successfully.",
      data,
    });
  } catch (error) {
    console.error("saveBulkAttendance error:", error);

    return sendError(
      res,
      500,
      "An unexpected error occurred while saving attendance.",
    );
  }
};
