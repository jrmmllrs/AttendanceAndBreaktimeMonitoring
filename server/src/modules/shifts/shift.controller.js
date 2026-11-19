import { supabaseAdmin } from "../../config/supabase.js";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const VALID_REST_DAYS = [0, 1, 2, 3, 4, 5, 6];

function success(res, data, message = "Success.") {
  return res.json({ success: true, message, data });
}

function failure(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function manilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return null;

  const [hours, minutes] = value.split(":").map(Number);

  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function normalizeTime(value) {
  return typeof value === "string" ? value.slice(0, 5) : value;
}

function normalizeRestDays(value) {
  if (!Array.isArray(value)) return null;

  const days = [...new Set(value.map(Number))];

  if (
    days.some((day) => !Number.isInteger(day) || !VALID_REST_DAYS.includes(day))
  ) {
    return null;
  }

  return days.sort((a, b) => a - b);
}

function validateShift(body) {
  const name = String(body.name || "").trim();
  const startTime = normalizeTime(body.start_time);
  const endTime = normalizeTime(body.end_time);
  const grace = Number(body.grace_period_minutes);
  const expected = Number(body.expected_work_minutes);
  const restDays = normalizeRestDays(body.rest_days ?? []);

  if (!name) return { error: "Shift name is required." };
  if (name.length > 100) {
    return { error: "Shift name cannot exceed 100 characters." };
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return { error: "Please provide valid start and end times." };
  }

  if (startMinutes === endMinutes) {
    return { error: "Shift start and end times cannot be the same." };
  }

  if (!Number.isInteger(grace) || grace < 0 || grace > 1440) {
    return { error: "Grace period must be between 0 and 1440 minutes." };
  }

  if (!Number.isInteger(expected) || expected <= 0) {
    return { error: "Expected work minutes must be greater than zero." };
  }

  const overnight = endMinutes < startMinutes;
  const duration = overnight
    ? 1440 - startMinutes + endMinutes
    : endMinutes - startMinutes;

  if (expected > duration) {
    return {
      error: "Expected work minutes cannot exceed the total shift duration.",
    };
  }

  if (!restDays) {
    return { error: "Invalid rest days. Select valid days of the week." };
  }

  return {
    value: {
      name,
      description: String(body.description || "").trim() || null,
      start_time: startTime,
      end_time: endTime,
      grace_period_minutes: grace,
      expected_work_minutes: expected,
      rest_days: restDays,
    },
  };
}

function dbErrorMessage(error) {
  if (error?.code === "23505") {
    return "A shift with this name already exists.";
  }

  if (error?.code === "23P01") {
    return "This assignment overlaps another shift assignment.";
  }

  return error?.message || "Database operation failed.";
}

function employeeName(employee) {
  return [
    employee?.first_name,
    employee?.middle_name,
    employee?.last_name,
    employee?.suffix,
  ]
    .filter(Boolean)
    .join(" ");
}

async function getEmployeeMap(employeeIds) {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabaseAdmin
    .from("employees")
    .select(
      `
      id,
      employee_number,
      first_name,
      middle_name,
      last_name,
      suffix,
      department_id,
      position_id,
      employment_status
    `,
    )
    .in("id", ids);

  if (error) throw error;

  return Object.fromEntries(
    (data || []).map((employee) => [
      employee.id,
      {
        ...employee,
        full_name: employeeName(employee),
      },
    ]),
  );
}

async function getDepartmentMap(departmentIds) {
  const ids = [...new Set(departmentIds.filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id, name")
    .in("id", ids);

  if (error) throw error;

  return Object.fromEntries(
    (data || []).map((department) => [department.id, department]),
  );
}

// GET /api/shifts
export async function getShifts(req, res) {
  try {
    const search = String(req.query.search || "").trim();
    const status = req.query.status || "active";

    let query = supabaseAdmin
      .from("shifts")
      .select("*")
      .order("start_time", { ascending: true });

    if (status === "active") query = query.eq("is_active", true);
    if (status === "inactive") query = query.eq("is_active", false);

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data: shifts, error } = await query;
    if (error) throw error;

    const today = manilaDate();
    const shiftIds = (shifts || []).map((shift) => shift.id);

    let assignments = [];

    if (shiftIds.length) {
      const { data, error: assignmentError } = await supabaseAdmin
        .from("employee_shift_assignments")
        .select("id, shift_id, employee_id, effective_from, effective_until")
        .in("shift_id", shiftIds)
        .lte("effective_from", today)
        .or(`effective_until.is.null,effective_until.gte.${today}`);

      if (assignmentError) throw assignmentError;
      assignments = data || [];
    }

    const counts = {};

    for (const assignment of assignments) {
      counts[assignment.shift_id] = (counts[assignment.shift_id] || 0) + 1;
    }

    return success(
      res,
      (shifts || []).map((shift) => ({
        ...shift,
        start_time: normalizeTime(shift.start_time),
        end_time: normalizeTime(shift.end_time),
        assigned_employee_count: counts[shift.id] || 0,
        rest_day_names: (shift.rest_days || []).map((day) => DAY_NAMES[day]),
      })),
    );
  } catch (error) {
    console.error("GET SHIFTS ERROR:", error);
    return failure(res, 500, dbErrorMessage(error));
  }
}

// GET /api/shifts/references
export async function getShiftReferences(req, res) {
  try {
    const [employeesResult, departmentsResult] = await Promise.all([
      supabaseAdmin
        .from("employees")
        .select(
          `
          id,
          employee_number,
          first_name,
          middle_name,
          last_name,
          suffix,
          department_id,
          position_id
        `,
        )
        .eq("employment_status", "active")
        .order("first_name"),

      supabaseAdmin
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),
    ]);

    if (employeesResult.error) throw employeesResult.error;
    if (departmentsResult.error) throw departmentsResult.error;

    const employees = (employeesResult.data || []).map((employee) => ({
      ...employee,
      full_name: employeeName(employee),
    }));

    return success(res, {
      employees,
      departments: departmentsResult.data || [],
      rest_days: DAY_NAMES.map((name, value) => ({ value, name })),
    });
  } catch (error) {
    console.error("GET SHIFT REFERENCES ERROR:", error);
    return failure(res, 500, dbErrorMessage(error));
  }
}

// GET /api/shifts/assignments
export async function getShiftAssignments(req, res) {
  try {
    const { employee_id, shift_id, department_id, history } = req.query;

    let query = supabaseAdmin
      .from("employee_shift_assignments")
      .select("*")
      .order("effective_from", { ascending: false });

    if (employee_id) {
      if (!isUuid(employee_id)) {
        return failure(res, 400, "Invalid employee ID.");
      }
      query = query.eq("employee_id", employee_id);
    }

    if (shift_id) {
      if (!isUuid(shift_id)) {
        return failure(res, 400, "Invalid shift ID.");
      }
      query = query.eq("shift_id", shift_id);
    }

    if (history !== "true") {
      const today = manilaDate();
      query = query
        .lte("effective_from", today)
        .or(`effective_until.is.null,effective_until.gte.${today}`);
    }

    const { data: assignments, error } = await query;
    if (error) throw error;

    const employeeMap = await getEmployeeMap(
      (assignments || []).map((item) => item.employee_id),
    );

    let filtered = assignments || [];

    if (department_id) {
      if (!isUuid(department_id)) {
        return failure(res, 400, "Invalid department ID.");
      }

      filtered = filtered.filter(
        (item) =>
          employeeMap[item.employee_id]?.department_id === department_id,
      );
    }

    const shiftIds = [...new Set(filtered.map((item) => item.shift_id))];

    let shiftMap = {};

    if (shiftIds.length) {
      const { data, error: shiftError } = await supabaseAdmin
        .from("shifts")
        .select("id, name, start_time, end_time, is_overnight")
        .in("id", shiftIds);

      if (shiftError) throw shiftError;

      shiftMap = Object.fromEntries(
        (data || []).map((shift) => [shift.id, shift]),
      );
    }

    const departmentMap = await getDepartmentMap(
      filtered.map((item) => employeeMap[item.employee_id]?.department_id),
    );

    return success(
      res,
      filtered.map((item) => ({
        ...item,
        employee: employeeMap[item.employee_id] || null,
        department:
          departmentMap[employeeMap[item.employee_id]?.department_id] || null,
        shift: shiftMap[item.shift_id] || null,
      })),
    );
  } catch (error) {
    console.error("GET SHIFT ASSIGNMENTS ERROR:", error);
    return failure(res, 500, dbErrorMessage(error));
  }
}

// GET /api/shifts/:id
export async function getShift(req, res) {
  try {
    const { id } = req.params;

    if (!isUuid(id)) return failure(res, 400, "Invalid shift ID.");

    const { data: shift, error } = await supabaseAdmin
      .from("shifts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!shift) return failure(res, 404, "Shift not found.");

    const { data: assignments, error: assignmentError } = await supabaseAdmin
      .from("employee_shift_assignments")
      .select("*")
      .eq("shift_id", id)
      .order("effective_from", { ascending: false });

    if (assignmentError) throw assignmentError;

    const employeeMap = await getEmployeeMap(
      (assignments || []).map((item) => item.employee_id),
    );

    return success(res, {
      ...shift,
      start_time: normalizeTime(shift.start_time),
      end_time: normalizeTime(shift.end_time),
      rest_day_names: (shift.rest_days || []).map((day) => DAY_NAMES[day]),
      assignments: (assignments || []).map((item) => ({
        ...item,
        employee: employeeMap[item.employee_id] || null,
      })),
    });
  } catch (error) {
    console.error("GET SHIFT ERROR:", error);
    return failure(res, 500, dbErrorMessage(error));
  }
}

// POST /api/shifts
export async function createShift(req, res) {
  try {
    const validation = validateShift(req.body);

    if (validation.error) {
      return failure(res, 400, validation.error);
    }

    const { data, error } = await supabaseAdmin
      .from("shifts")
      .insert(validation.value)
      .select("*")
      .single();

    if (error) throw error;

    return success(res, data, "Shift created successfully.");
  } catch (error) {
    console.error("CREATE SHIFT ERROR:", error);
    return failure(
      res,
      error?.code === "23505" ? 409 : 400,
      dbErrorMessage(error),
    );
  }
}

// PATCH /api/shifts/:id
export async function updateShift(req, res) {
  try {
    const { id } = req.params;

    if (!isUuid(id)) return failure(res, 400, "Invalid shift ID.");

    const validation = validateShift(req.body);
    if (validation.error) {
      return failure(res, 400, validation.error);
    }

    const { data, error } = await supabaseAdmin
      .from("shifts")
      .update(validation.value)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return failure(res, 404, "Shift not found.");

    return success(res, data, "Shift updated successfully.");
  } catch (error) {
    console.error("UPDATE SHIFT ERROR:", error);
    return failure(
      res,
      error?.code === "23505" ? 409 : 400,
      dbErrorMessage(error),
    );
  }
}

// PATCH /api/shifts/:id/status
export async function updateShiftStatus(req, res) {
  try {
    const { id } = req.params;
    const isActive = req.body.is_active;

    if (!isUuid(id)) return failure(res, 400, "Invalid shift ID.");
    if (typeof isActive !== "boolean") {
      return failure(res, 400, "A valid active status is required.");
    }

    if (!isActive) {
      const today = manilaDate();

      const { data: assignments, error: assignmentError } = await supabaseAdmin
        .from("employee_shift_assignments")
        .select("id")
        .eq("shift_id", id)
        .lte("effective_from", today)
        .or(`effective_until.is.null,effective_until.gte.${today}`)
        .limit(1);

      if (assignmentError) throw assignmentError;

      if (assignments?.length) {
        return failure(
          res,
          409,
          "This shift has employees currently assigned. Reassign them before deactivating it.",
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("shifts")
      .update({ is_active: isActive })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return failure(res, 404, "Shift not found.");

    return success(
      res,
      data,
      isActive ? "Shift activated." : "Shift deactivated.",
    );
  } catch (error) {
    console.error("UPDATE SHIFT STATUS ERROR:", error);
    return failure(res, 400, dbErrorMessage(error));
  }
}

// POST /api/shifts/assignments
export async function assignEmployeeShift(req, res) {
  try {
    const { employee_id, shift_id, effective_from, effective_until, notes } =
      req.body;

    if (!isUuid(employee_id) || !isUuid(shift_id)) {
      return failure(res, 400, "Select a valid employee and shift.");
    }

    if (!isValidDate(effective_from)) {
      return failure(res, 400, "A valid effective start date is required.");
    }

    if (effective_until && !isValidDate(effective_until)) {
      return failure(res, 400, "Invalid effective end date.");
    }

    if (effective_until && effective_until < effective_from) {
      return failure(
        res,
        400,
        "Effective end date cannot be earlier than the start date.",
      );
    }

    const { data: assignmentId, error } = await supabaseAdmin.rpc(
      "assign_employee_shift",
      {
        p_employee_id: employee_id,
        p_shift_id: shift_id,
        p_effective_from: effective_from,
        p_assigned_by: req.user.id,
        p_notes: String(notes || "").trim() || null,
        p_effective_until: effective_until || null,
      },
    );

    if (error) {
      console.error("ASSIGN SHIFT RPC ERROR:", error);
      return failure(res, 409, dbErrorMessage(error));
    }

    return success(
      res,
      { id: assignmentId },
      "Employee shift assigned successfully.",
    );
  } catch (error) {
    console.error("ASSIGN EMPLOYEE SHIFT ERROR:", error);
    return failure(res, 500, dbErrorMessage(error));
  }
}

// POST /api/shifts/assignments/bulk
export async function bulkAssignEmployeeShifts(req, res) {
  try {
    const { employee_ids, shift_id, effective_from, effective_until, notes } =
      req.body;

    if (!Array.isArray(employee_ids) || !employee_ids.length) {
      return failure(res, 400, "Select at least one employee.");
    }

    if (employee_ids.length > 100) {
      return failure(res, 400, "You can assign up to 100 employees at a time.");
    }

    if (!employee_ids.every(isUuid) || !isUuid(shift_id)) {
      return failure(res, 400, "Invalid employee or shift selection.");
    }

    if (!isValidDate(effective_from)) {
      return failure(res, 400, "A valid effective start date is required.");
    }

    if (effective_until && !isValidDate(effective_until)) {
      return failure(res, 400, "Invalid effective end date.");
    }

    if (effective_until && effective_until < effective_from) {
      return failure(res, 400, "Invalid effective date range.");
    }

    const uniqueIds = [...new Set(employee_ids)];
    const results = [];

    // Each employee assignment is its own database transaction.
    // One employee's failure will not roll back other successful assignments.
    for (const employeeId of uniqueIds) {
      const { data, error } = await supabaseAdmin.rpc("assign_employee_shift", {
        p_employee_id: employeeId,
        p_shift_id: shift_id,
        p_effective_from: effective_from,
        p_assigned_by: req.user.id,
        p_notes: String(notes || "").trim() || null,
        p_effective_until: effective_until || null,
      });

      results.push({
        employee_id: employeeId,
        success: !error,
        assignment_id: error ? null : data,
        message: error ? dbErrorMessage(error) : "Assigned successfully.",
      });
    }

    const successful = results.filter((item) => item.success).length;
    const failed = results.length - successful;

    return res.json({
      success: failed === 0,
      message: `${successful} assigned successfully. ${failed} failed.`,
      data: {
        successful,
        failed,
        results,
      },
    });
  } catch (error) {
    console.error("BULK ASSIGN SHIFT ERROR:", error);
    return failure(res, 500, dbErrorMessage(error));
  }
}
