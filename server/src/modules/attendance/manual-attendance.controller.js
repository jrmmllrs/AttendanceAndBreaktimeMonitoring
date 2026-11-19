import { supabaseAdmin } from "../../config/supabase.js";

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

const isValidDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00`));

const getManilaToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const getSupervisorDepartmentIds = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id")
    .eq("supervisor_profile_id", userId)
    .eq("is_active", true);

  if (error) throw error;

  return (data || []).map((department) => department.id);
};

/**
 * GET /attendance/management/manual-employees
 *
 * Returns employees, attendance, shifts, break records,
 * and ALL globally active break schedules.
 *
 * Break schedules are no longer filtered by:
 * - Employee shift
 * - Employee department
 * - Maximum occurrences
 */
export const getManualAttendanceEmployees = async (req, res) => {
  try {
    const workDate = req.query.work_date || getManilaToday();
    const search = String(req.query.search || "").trim();
    const departmentId = req.query.department_id;

    if (!isValidDate(workDate)) {
      return sendError(res, 400, "Invalid attendance date.");
    }

    let employeeQuery = supabaseAdmin
      .from("employees")
      .select(
        `
        id,
        employee_number,
        first_name,
        middle_name,
        last_name,
        suffix,
        photo_url,
        department_id,
        position_id,
        employment_status
      `,
      )
      .eq("employment_status", "active")
      .order("last_name", { ascending: true });

    if (departmentId && departmentId !== "all") {
      employeeQuery = employeeQuery.eq("department_id", departmentId);
    }

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ").trim();

      if (safeSearch) {
        employeeQuery = employeeQuery.or(
          `employee_number.ilike.%${safeSearch}%,first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%`,
        );
      }
    }

    const { data: employees, error: employeeError } = await employeeQuery;

    if (employeeError) throw employeeError;

    let visibleEmployees = employees || [];

    // Supervisors can only see employees from their assigned departments.
    if (req.user.role === "supervisor") {
      const departmentIds = await getSupervisorDepartmentIds(req.user.id);

      visibleEmployees = visibleEmployees.filter((employee) =>
        departmentIds.includes(employee.department_id),
      );
    }

    if (visibleEmployees.length === 0) {
      return res.json({
        success: true,
        work_date: workDate,
        employees: [],
      });
    }

    const employeeIds = visibleEmployees.map((employee) => employee.id);

    const [
      assignmentResult,
      attendanceResult,
      departmentResult,
      positionResult,
      scheduleResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("employee_shift_assignments")
        .select(
          `
          id,
          employee_id,
          shift_id,
          effective_from,
          effective_until
        `,
        )
        .in("employee_id", employeeIds)
        .lte("effective_from", workDate)
        .or(`effective_until.is.null,effective_until.gte.${workDate}`)
        .order("effective_from", { ascending: false }),

      supabaseAdmin
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
          undertime_minutes,
          total_worked_minutes,
          total_break_minutes,
          excess_break_minutes,
          actual_overtime_minutes,
          notes
        `,
        )
        .in("employee_id", employeeIds)
        .eq("work_date", workDate),

      supabaseAdmin.from("departments").select("id, name"),

      supabaseAdmin.from("positions").select("id, name"),

      // Get all globally active break schedules.
      supabaseAdmin
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
          max_occurrences_per_shift,
          is_active
        `,
        )
        .eq("is_active", true)
        .order("sequence_number", { ascending: true }),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (attendanceResult.error) throw attendanceResult.error;
    if (departmentResult.error) throw departmentResult.error;
    if (positionResult.error) throw positionResult.error;
    if (scheduleResult.error) throw scheduleResult.error;

    // Keep the latest effective shift assignment per employee.
    const assignmentByEmployee = new Map();

    for (const assignment of assignmentResult.data || []) {
      if (!assignmentByEmployee.has(assignment.employee_id)) {
        assignmentByEmployee.set(assignment.employee_id, assignment);
      }
    }

    const assignments = [...assignmentByEmployee.values()];

    const shiftIds = [
      ...new Set(assignments.map((item) => item.shift_id).filter(Boolean)),
    ];

    let shifts = [];

    if (shiftIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("shifts")
        .select(
          `
          id,
          name,
          start_time,
          end_time,
          is_overnight,
          grace_period_minutes,
          expected_work_minutes
        `,
        )
        .in("id", shiftIds);

      if (error) throw error;

      shifts = data || [];
    }

    const schedules = scheduleResult.data || [];

    // Get active break types linked to active schedules.
    const typeIds = [
      ...new Set(
        schedules.map((schedule) => schedule.break_type_id).filter(Boolean),
      ),
    ];

    let breakTypes = [];

    if (typeIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("break_types")
        .select(
          `
          id,
          name,
          is_paid,
          is_active
        `,
        )
        .in("id", typeIds)
        .eq("is_active", true);

      if (error) throw error;

      breakTypes = data || [];
    }

    const attendanceRecords = attendanceResult.data || [];

    const attendanceIds = attendanceRecords.map((item) => item.id);

    let breakRecords = [];

    if (attendanceIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("break_records")
        .select(
          `
          id,
          attendance_id,
          employee_id,
          break_schedule_id,
          break_type_id,
          break_name,
          actual_start_at,
          actual_end_at,
          allowed_duration_minutes,
          actual_duration_minutes,
          excess_minutes,
          status,
          notes
        `,
        )
        .in("attendance_id", attendanceIds)
        .neq("status", "cancelled")
        .order("actual_start_at", { ascending: true });

      if (error) throw error;

      breakRecords = data || [];
    }

    const shiftById = new Map(shifts.map((item) => [item.id, item]));

    const attendanceByEmployee = new Map(
      attendanceRecords.map((item) => [item.employee_id, item]),
    );

    const departmentById = new Map(
      (departmentResult.data || []).map((item) => [item.id, item.name]),
    );

    const positionById = new Map(
      (positionResult.data || []).map((item) => [item.id, item.name]),
    );

    const typeById = new Map(breakTypes.map((item) => [item.id, item]));

    const breaksByAttendance = new Map();

    for (const record of breakRecords) {
      const list = breaksByAttendance.get(record.attendance_id) || [];

      list.push(record);

      breaksByAttendance.set(record.attendance_id, list);
    }

    const result = visibleEmployees.map((employee) => {
      const assignment = assignmentByEmployee.get(employee.id) || null;

      const shift = assignment
        ? shiftById.get(assignment.shift_id) || null
        : null;

      const attendance = attendanceByEmployee.get(employee.id) || null;

      // All active global schedules are available to every employee.
      // No shift or department filtering is applied here.
      const employeeSchedules = schedules
        .filter((schedule) => Boolean(typeById.get(schedule.break_type_id)))
        .map((schedule) => ({
          ...schedule,
          break_type: typeById.get(schedule.break_type_id) || null,
        }));

      return {
        ...employee,

        full_name: [
          employee.first_name,
          employee.middle_name,
          employee.last_name,
          employee.suffix,
        ]
          .filter(Boolean)
          .join(" "),

        department_name:
          departmentById.get(employee.department_id) || "Unassigned",

        position_name: positionById.get(employee.position_id) || "Unassigned",

        shift_assignment: assignment,
        shift,

        break_schedules: employeeSchedules,

        attendance,

        break_records: attendance
          ? breaksByAttendance.get(attendance.id) || []
          : [],
      };
    });

    return res.json({
      success: true,
      work_date: workDate,
      employees: result,
    });
  } catch (error) {
    console.error("getManualAttendanceEmployees:", error);

    return sendError(
      res,
      500,
      error.message || "Unable to load employees for manual attendance.",
    );
  }
};

/**
 * POST /attendance/management/manual-entry
 *
 * Legacy manual time-in/time-out attendance endpoint.
 * Retained to avoid breaking existing routes or workflows.
 */
export const saveManualAttendance = async (req, res) => {
  try {
    const {
      employee_id,
      work_date,
      clock_in_at,
      clock_out_at,
      breaks = [],
      notes = null,
    } = req.body || {};

    if (!employee_id || !isValidDate(work_date)) {
      return sendError(res, 400, "Employee and valid work date are required.");
    }

    if (!clock_in_at || !clock_out_at) {
      return sendError(res, 400, "Time in and time out are required.");
    }

    if (!Array.isArray(breaks)) {
      return sendError(res, 400, "Break entries must be an array.");
    }

    const clockIn = new Date(clock_in_at);
    const clockOut = new Date(clock_out_at);

    if (
      Number.isNaN(clockIn.getTime()) ||
      Number.isNaN(clockOut.getTime()) ||
      clockOut <= clockIn
    ) {
      return sendError(
        res,
        400,
        "Please provide valid time in and time out values.",
      );
    }

    for (const item of breaks) {
      if (
        !item.break_schedule_id ||
        !item.actual_start_at ||
        !item.actual_end_at
      ) {
        return sendError(
          res,
          400,
          "Each entered break needs both a start time and an end time.",
        );
      }

      const start = new Date(item.actual_start_at);
      const end = new Date(item.actual_end_at);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        return sendError(
          res,
          400,
          "One or more break time ranges are invalid.",
        );
      }
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select(
        `
          id,
          department_id,
          employment_status
        `,
      )
      .eq("id", employee_id)
      .maybeSingle();

    if (employeeError) throw employeeError;

    if (!employee) {
      return sendError(res, 404, "Employee not found.");
    }

    if (employee.employment_status !== "active") {
      return sendError(
        res,
        400,
        "Only active employees can have attendance encoded.",
      );
    }

    if (req.user.role === "supervisor") {
      const departmentIds = await getSupervisorDepartmentIds(req.user.id);

      if (!departmentIds.includes(employee.department_id)) {
        return sendError(
          res,
          403,
          "You can only encode attendance for employees in your assigned departments.",
        );
      }
    }

    const { data, error } = await supabaseAdmin.rpc("save_manual_attendance", {
      p_employee_id: employee_id,
      p_work_date: work_date,
      p_clock_in_at: clock_in_at,
      p_clock_out_at: clock_out_at,
      p_breaks: breaks,
      p_notes: notes,
      p_created_by: req.user.id,
    });

    if (error) {
      console.error("saveManualAttendance RPC:", error);

      return sendError(res, 400, error.message || "Unable to save attendance.");
    }

    if (data?.success === false) {
      return sendError(res, 400, data.message || "Unable to save attendance.");
    }

    return res.status(201).json({
      success: true,
      message: data?.message || "Manual attendance saved successfully.",
      data,
    });
  } catch (error) {
    console.error("saveManualAttendance:", error);

    return sendError(res, 500, error.message || "Unable to save attendance.");
  }
};
